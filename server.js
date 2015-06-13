var express = require('express');
var request = require('request');
var util = require('util');
var async = require('async');
var apigee = require('apigee-access');
var cache = apigee.getCache('the100');
var moment = require('moment');
var app = express();
var CronJob = require('cron').CronJob;

var baasUrl = "https://api.usergrid.com/the100/slack";
var slackWebHookUrl = "https://hooks.slack.com/services/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";
var defaultGroup = 186;
var token = "";
var quotes = [] // Not used

app.get('/', function(req, res) {
    var fullUrl = util.format("%s://%s%s", req.protocol, req.get('host'), req.originalUrl);
    res.json({
        hint: util.format("Append a url segment with a group ID from the100.io, e.g. %s100", fullUrl)
    })
});

app.get('/:group', function(req, res) {
    get100Data(parseInt(req.params.group), function(err, results) {
        if (err) {
            res.status(500).json({
                error: "Error loading web data."
            });
        } else {
            res.json(results.scrape);
            token = results.token.access_token;
            scrapeHandler(results.scrape.games, function(success) {
                if (success) {
                    console.log("Job completed successfully");
                }
            });
        }
    });
});

app.listen(process.env.PORT || 8000, function() {
    // request.get("http://localhost:8000/186");
});

var job = new CronJob('0 * * * * *', function() {
    console.log("Started cron job");
    get100Data(defaultGroup, function(err, results) {
        token = results.token.access_token;
        scrapeHandler(results.scrape, function(success) {
            if (success) {
                console.log("Job completed successfully");
            }
        });
    });
}, function() {
    console.log("Cron job finished");
}, true, null);

function get100Data(group, callback) {
    async.parallel({
            token: function(callback) {
                request.post({
                        url: baasUrl + "/token",
                        json: true,
                        body: {
                            "client_id": "YXA6_KYXsBEfEeWDGf9DpoauPA",
                            "client_secret": "YXA6G6EJpalNy2-48qgBkoSo8O_wzgE",
                            "grant_type": "client_credentials",
                            "ttl": 0
                        }
                    },
                    function(e, r, body) {
                        callback(null, body);
                    });
            },
            scrape: function(callback) {
                var python = require('child_process').spawn(
                    'python', ["scrape.py", group]
                );
                var scrapedData = "";
                python.stdout.on('data', function(data) {
                    scrapedData += data
                });
                python.on('close', function(code) {
                    if (code !== 0) {
                        callback(true);
                    } else {
                        callback(null, JSON.parse(scrapedData));
                    }
                });
            }
        },
        function(err, results) {
            callback(err, results);
        });
}

function scrapeHandler(games, callback) {
    async.each(games, function(game, callback) {
            request.get({
                url: baasUrl + "/games?ql=where%20gameId=" + game.gameId,
                auth: {
                    bearer: token
                },
                json: true
            }, function(e, r, body) {
                if (body.count === 0) {
                    console.log(util.format("Creating new game for %s", game.gameId))
                    request.post({
                        url: baasUrl + "/games",
                        auth: {
                            bearer: token
                        },
                        json: true,
                        body: game
                    }, function(e, r, body) {
                        if (game.groupId === defaultGroup) {
                            notify(game, body.entities[0].uuid);
                        }
                    });
                } else if (body.entities[0].notification === "failed") {
                    if (game.groupId === defaultGroup) {
                        console.log(util.format("Re-sending notification for %s (%s)", game.gameId, body.entities[0].uuid))
                            notify(game, body.entities[0].uuid);
                    }
                } else {
                    console.log(util.format("Updating %s (%s)", game.gameId, body.entities[0].uuid))
                    request.put({
                        url: util.format("%s/games/%s", baasUrl, body.entities[0].uuid),
                        auth: {
                            bearer: token
                        },
                        json: true,
                        body: game
                    });
                }
            })
        },
        function(err) {
            callback(!err);
        });
}

function notify(game, uuid) {
    var relativeTime = moment(game.time).fromNow();
    var utcTime = util.format("%s GMT", moment(game.time).utc().format("MMM D, hh:mma"));
    var availableSpots = (game.maxPlayers - game.partySize) >= 0 ? game.maxPlayers - game.partySize : 0;
    var requiredLevelString = (game.requiredLevel) ? util.format("*level %s+* ", game.requiredLevel) : "";
    if (availableSpots > 0) {
        async.each(game.channels, function(channel, callback) {
            request.post({
                url: slackWebHookUrl,
                json: true,
                body: {
                    "attachments": [{
                        "color": "#ddd",
                        "fallback": game.description,
                        "text": game.description
                    }],
                    "channel": util.format("#%s", channel),
                    "icon_url": "https://www.the100.io/apple-touch-icon.png",
                    "text": util.format("New game by <@%s|%s> — *<%s|%s>*\nStarting *~%s* (%s) — need *%s* %sguardians", game.host.name, game.host.name, game.url, game.title, relativeTime, utcTime, availableSpots, requiredLevelString),
                    "username": "the100"
                }
            }, function(e, r, body) {
                if (body === "ok") {
                    console.log(util.format("Notification sent to %s for game %s", channel, game.gameId));
                    request.put({
                        url: util.format("%s/games/%s", baasUrl, uuid),
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
                        url: util.format("%s/games/%s", baasUrl, uuid),
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
}