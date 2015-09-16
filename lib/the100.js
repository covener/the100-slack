var ok = require('objectkit');
var config = require('../config');
var util = require('util');
var async = require('async');
var request = require('request');
var child_process = require('child_process');
var moment = require('moment');
var Log = require('log'),
    log = new Log(config.logLevel)

var tokenRequest = {
    body: {
        client_id: config.apigeeClientId,
        client_secret: config.apigeeClientSecret,
        grant_type: "client_credentials",
        ttl: 0
    }
}

function guardianString(game) {
    var availableSpots = (game.maxPlayers - game.partySize) >= 0 ? game.maxPlayers - game.partySize : 0;
    var requiredLevelString = (game.requiredLevel) ? util.format("*level %s%s* ", game.requiredLevel, ((game.requiredLevel < 34) ? "+" : "")) : "";
    var returnString = "";
    if (availableSpots > 1) {
        returnString = util.format("need *%s* %sguardians", availableSpots, requiredLevelString);
    } else if (availableSpots === 1) {
        returnString = util.format("need *%s* %sguardian", availableSpots, requiredLevelString);
    } else if (availableSpots <= 0) {
        returnString = "(this game is full)";
    }
    return returnString;
}

function notifyRequest(game, channel) {
    return {
        relativeTime: moment(game.time).fromNow(),
        gameTime: util.format("%s PST", moment(game.time).format("ddd, MMM D, hh:mma")),
        body: {
            attachments: [{
                color: "#ddd",
                fallback: game.description,
                text: game.description
            }],
            channel: util.format("#%s", channel),
            icon_url: "https://www.the100.io/apple-touch-icon.png",
            text: util.format("New game by <@%s|%s> — *<%s|%s>*\nStarting *%s* (%s) — %s", game.host.name, game.host.name, game.url, game.title, this.relativeTime, this.gameTime, guardianString(game)),
            username: "the100"
        }
    }
}

function notify(groupConfig, game, uuid) {
    // Only send notification if notify is enabled in config and game starts in the future
    if (parseInt(game.groupId) !== parseInt(groupConfig.id)) {
        log.info(util.format("Not sending notification for game %s; it's groupId (%s) does not match groupConfig.id (%s)", game.gameId, game.groupId, groupConfig.id));
    } else if (!config.notify) {
        log.info(util.format("Notifications are disabled in config.json; will not send notification for game %s", game.gameId));
    } else if (!moment(game.time).isAfter(moment())) {
        log.info(util.format("Game time (%s) for game %s is in the past", moment(game.time).format("ddd, MMM D, hh:mma"), game.gameId));
    } else {
        if (config.notifyGeneral) {
            game.channels.push("general"); // add the general channel too
        }
        async.each(game.channels, function(channel) {
            request.post({
                url: groupConfig.slackWebhookUrl,
                json: true,
                body: notifyRequest(game, channel).body
            }, function(e, r, body) {
                if (body === "ok") {
                    log.info(util.format("Notification sent to %s for game %s for group %s", channel, game.gameId, groupConfig.id));
                    request.put({
                        url: util.format("%s/games/%s", config.apigeeUri, uuid),
                        json: true,
                        body: {
                            notification: "delivered"
                        }
                    }, function(e, r, body) {
                        log.debug(util.format("Set notification status to '%'", body.entities[0].notification));
                    });
                } else {
                    log.error(util.format("Slack notification failed to send: %s", body))
                    request.put({
                        url: util.format("%s/games/%s", config.apigeeUri, uuid),
                        json: true,
                        body: {
                            notification: "failed"
                        }
                    }, function(e, r, body) {
                        log.debug(util.format("Set notification status to '%'", body.entities[0].notification));
                    });
                }
            });
        });
    }
}

function setGameIgnored(groupConfig, game, uuid) {
    request.put({
        url: util.format("%s/games/%s", config.apigeeUri, uuid),
        json: true,
        body: {
            notification: "ignored"
        }
    }, function(e, r, body) {
        log.info(util.format("Set notification status for game %s to 'ignored'", game.gameId));
    });
}

// Exports

function getData(groupConfig, callback) {
    async.parallel({
        token: function(callback) {
            request.post({
                url: config.apigeeUri + "/token",
                json: true,
                body: tokenRequest.body
            }, function(e, r, body) {
                if (!e && r.statusCode === 200 && ok(body).has('access_token')) {
                    request = request.defaults({
                        auth: {
                            bearer: body.access_token
                        }
                    })
                }
                callback(e, body);
            });
        },
        scrape: function(callback) {
            var err = false;
            var python = child_process.spawn(
                'python', ["lib/scrape.py", groupConfig.id]
            );
            var scrapedData = "";
            python.stdout.on('data', function(data) {
                scrapedData += data
            });
            python.stderr.on('data', function(data) {
                err = true;
                scrapedData += data
            });
            python.on('error', function(error) {
                err = true;
                scrapedData = util.format("Did not complete data scrape", error);
            });
            python.on("exit", function(exitCode) {
                if (exitCode !== 0) {
                    err = true;
                }
            });
            python.stdout.on('end', function() {
                log.debug(util.format("Completed scrape for %s", groupConfig.id))
                if (err) {
                    callback(scrapedData)
                } else {
                    callback(null, JSON.parse(scrapedData));
                }
            });
        }
    }, function(err, results) {
        callback(err, results);
    });
}

function processData(groupConfig, results) {
    if (ok(results).has('token.access_token')) {
        async.each(results.scrape.games, function(game, callback) {
            processScrape(groupConfig, game);
        }, function(err) {
            if (!err) {
                log.debug(util.format("Job completed successfully for group %s", groupConfig.groupId));
            } else {
                log.error("Job completed with errors");
            }
        });
    } else {
        log.error("Could not retrieve token: ", results.token)
    }
}

function processScrape(groupConfig, game) {
    var url = util.format("%s/games?ql=where%20gameId=%s", config.apigeeUri, game.gameId);
    request.get({
        url: url,
        json: true
    }, function(e, r, body) {
        var notification = ok(body).getIfExists('entities.0.notification') || "ignored";
        if (e || !r) {
            log.error(util.format("BaaS request failed (empty response) – %s", url));
        } else if (e || r.statusCode !== 200 || ok(body).has('error')) {
            log.error(util.format("BaaS request failed (%s) – %s\n", ok(r).getIfExists('statusCode'), url), body);
        } else if (ok(body).getIfExists('count') === 0) {
            log.info(util.format("Creating new game %s (group %s)", game.gameId, game.groupId))
            request.post({
                url: util.format("%s/games", config.apigeeUri),
                json: true,
                body: game
            }, function(e, r, body) {
                notify(groupConfig, game, ok(body).getIfExists('entities.0.uuid'));
            });
        } else if (notification !== "delivered" && notification !== "ignored") {
            log.info(util.format("Re-sending notification for game %s (group %s)", game.gameId, game.groupId))
            notify(groupConfig, game, ok(body).getIfExists('entities.0.uuid'));
            log.debug(util.format("Updating %s (%s)", game.gameId, body.entities[0].uuid))
            request.put({
                url: util.format("%s/games/%s", config.apigeeUri, body.entities[0].uuid),
                json: true,
                body: game
            });
        } else {
            log.debug(util.format("Already handled game %s (%s)", game.gameId, body.entities[0].uuid))
        }
    });
}

module.exports = {
    getData: getData,
    processData: processData
}