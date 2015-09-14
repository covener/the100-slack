var express = require('express');
var request = require('request');
var util = require('util');
var async = require('async');
var moment = require('moment');
var app = express();
var CronJob = require('cron').CronJob;

var token = "";
var fs = require('fs');
var globalConfig = JSON.parse(fs.readFileSync('config.json', 'utf8'));

app.get('/', function(req, res) {
    var fullUrl = util.format("%s://%s%s", req.protocol, req.get('host'), req.originalUrl);
    res.json({
        hint: util.format("Append a url segment with a group ID from the100.io, e.g. %s100", fullUrl)
    })
});

app.get('/:group', function(req, res) {
    var groupId = parseInt(req.params.group, 10);
    var groupConfig = getGroupConfig(groupId);
    if (groupConfig) {
        get100Data(groupConfig, function(err, results) {
            if (err) {
                res.status(500).json({
                    error: "Error loading web data."
                });
            } else {
                res.json(results.scrape);
                if (results && results.token && results.token.access_token) {
                    token = results.token.access_token;
                } else {
                    console.log(util.format("token request failed: \n%s", results));
                }
                scrapeHandler(groupConfig, results.scrape.games, function(success) {
                    if (success && globalConfig.logging) {
                        console.log(util.format("Job completed successfully for group %s", req.params.group));
                    }
                });
            }
        });
    }
});

app.listen(process.env.PORT || 8000, function() {
    // Do stuff on server start
});

function getGroupConfig(groupId) {
    var groupConfig = globalConfig.groups[groupId.toString()];
    if (groupConfig) {
        // populate the id into the object for easy access
        groupConfig.id = parseInt(groupId);
    }
    return groupConfig;
}

new CronJob('*/20 * * * * *', function() {
    if (globalConfig.loggingCron) {
        console.log("Started cron job on %s", moment());
    }
    for (var groupId in globalConfig.groups) {
        if (globalConfig.groups.hasOwnProperty(groupId)) {
            var groupConfig = getGroupConfig(groupId);
            get100Data(groupConfig, function(err, results) {
                if (err) {
                    console.log(util.format("Error: %s", err), results);
                } else if (results && results.token && results.token.access_token) {
                    var token = results.token.access_token;
                    scrapeHandler(results.groupConfig, results.scrape.games, function(success) {
                        if (success && globalConfig.loggingCron) {
                            console.log(util.format("Job completed successfully for %s", groupId));
                        }
                    });
                } else {
                    console.log(util.format("Error retrieving token request: \n", results))
                }
            });
        }
    }
});

function get100Data(groupConfig, callback) {
    async.parallel({
        token: function(callback) {
            request.post({
                url: globalConfig.apigeeBaseUrl + "/token",
                json: true,
                body: {
                    "client_id": globalConfig.apigeeClientId,
                    "client_secret": globalConfig.apigeeClientSecret,
                    "grant_type": "client_credentials",
                    "ttl": 0
                }
            }, function(e, r, body) {
                callback(e, body);
            });
        },
        scrape: function(callback) {
            var python = require('child_process').spawn(
                'python', ["scrape.py", groupConfig.id]
            );
            var scrapedData = "";
            python.stdout.on('data', function(data) {
                scrapedData += data
            });
            python.on('close', function(code) {
                if (code !== 0) {
                    callback(code);
                } else {
                    callback(null, JSON.parse(scrapedData));
                }
            });
        }
    }, function(err, results) {
        results.groupConfig = groupConfig;
        callback(err, results);
    });
}

function scrapeHandler(groupConfig, games, callback) {
    async.each(games, function(game, callback) {
        var url = util.format("%s/games?ql=where%20gameId=%s", globalConfig.apigeeBaseUrl, game.gameId);
        request.get({
            url: url,
            auth: {
                bearer: token
            },
            json: true
        }, function(e, r, body) {
            if (e || !body) {
                console.log("Error: bad BaaS request:\n", url);
                console.log(new Date(), r.statusCode, body);
                callback(e);
            } else {
                if (body.hasOwnProperty('count') && body.count === 0) {
                    if (globalConfig.logging) {
                        console.log(util.format("Creating new game %s (group %s)", game.gameId, game.groupId))
                    }
                    request.post({
                        url: util.format("%s/games", globalConfig.apigeeBaseUrl),
                        auth: {
                            bearer: token
                        },
                        json: true,
                        body: game
                    }, function(e, r, body) {
                        if (game.groupId === groupConfig.id) {
                            notify(groupConfig, game, body.entities[0].uuid);
                        }
                    });
                } else if (!('notification' in body.entities[0]) || ('notification' in body.entities[0] && body.entities[0].notification === "failed")) {
                    if (game.groupId === groupConfig.id) {
                        console.log(util.format("Re-sending notification for game %s (group %s)", game.gameId, game.groupId))
                        notify(groupConfig, game, body.entities[0].uuid);
                    }
                } else {
                    // if (globalConfig.logging) {
                    //     console.log(util.format("Updating %s (%s)", game.gameId, body.entities[0].uuid))
                    // }
                    request.put({
                        url: util.format("%s/games/%s", globalConfig.apigeeBaseUrl, body.entities[0].uuid),
                        auth: {
                            bearer: token
                        },
                        json: true,
                        body: game
                    });
                }
                callback();
            }
        })
    }, function(err) {
        callback(!err);
    });
}

function notify(groupConfig, game, uuid) {
    var relativeTime = moment(game.time).fromNow();
    var gameTime = util.format("%s PST", moment(game.time).format("ddd, MMM D, hh:mma"));
    var availableSpots = (game.maxPlayers - game.partySize) >= 0 ? game.maxPlayers - game.partySize : 0;
    var requiredLevelString = (game.requiredLevel) ? util.format("*level %s%s* ", game.requiredLevel, ((game.requiredLevel < 34) ? "+" : "")) : "";
    var guardianString = "";
    if (availableSpots > 1) {
        guardianString = util.format("need *%s* %sguardians", availableSpots, requiredLevelString);
    } else if (availableSpots == 1) {
        guardianString = util.format("need *%s* %sguardian", availableSpots, requiredLevelString);
    } else if (availableSpots <= 0) {
        guardianString = "(this game is full)";
    }
    game.channels.push("general"); // add the general channel too
    async.each(game.channels, function(channel, callback) {
        request.post({
            url: groupConfig.slackWebhookUrl,
            json: true,
            body: {
                "attachments": [{
                    "color": "#ddd",
                    "fallback": game.description,
                    "text": game.description
                }],
                "channel": util.format("#%s", channel),
                "icon_url": "https://www.the100.io/apple-touch-icon.png",
                "text": util.format("New game by <@%s|%s> — *<%s|%s>*\nStarting *%s* (%s) — %s", game.host.name, game.host.name, game.url, game.title, relativeTime, gameTime, guardianString),
                "username": "the100"
            }
        }, function(e, r, body) {
            if (body === "ok") {
                console.log(util.format("Notification sent to %s for game %s for group %s", channel, game.gameId, groupConfig.id));
                request.put({
                    url: util.format("%s/games/%s", globalConfig.apigeeBaseUrl, uuid),
                    auth: {
                        bearer: token
                    },
                    json: true,
                    body: {
                        notification: "delivered"
                    }
                });
            } else {
                console.log(util.format("Error sending Slack notification: %s", body))
                request.put({
                    url: util.format("%s/games/%s", globalConfig.apigeeBaseUrl, uuid),
                    auth: {
                        bearer: token
                    },
                    json: true,
                    body: {
                        notification: "failed"
                    }
                });
            }
        });
    });
}