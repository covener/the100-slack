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
var fs = require('fs');
var config = require("./quotes.json");
var quotes = JSON.parse(fs.readFileSync('quotes.json', 'utf8'));

/*
, {
    "name": "",
    "text": ""
}
*/

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
                // if (success) {
                //     console.log("Job completed successfully");
                // }
            });
        }
    });
});

app.listen(process.env.PORT || 8000, function() {
    // request.get("http://localhost:8000/186");
});

var gamesJob = new CronJob('*/20 * * * * *', function() {
    // console.log("Started cron job on %s", moment());
    get100Data(defaultGroup, function(err, results) {
        token = results.token.access_token;
        scrapeHandler(results.scrape.games, function(success) {
            // if (success) {
            //     console.log("Job completed successfully");
            // }
        });
    });
}, function() {
    // console.log("Cron job finished");
}, true, null);

var quoteJob = new CronJob('0 0 12 * * *', function() {
    var quote = quotes[Math.floor(Math.random() * quotes.length)];
    var text = (quote.name !== "") ? util.format("\"%s\"\n\n – _%s_", quote.text, quote.name) : quote.text;
    request.post({
        url: "https://hooks.slack.com/services/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",
        json: true,
        body: {
            "attachments": [{
                "color": "#danger",
                "fallback": text,
                "text": text,
                "mrkdwn_in": ["text", "pretext"]
            }],
            "channel": "#random",
            "icon_url": "https://rebekahlang.files.wordpress.com/2015/05/ghost-02-png.png",
            "username": "dinklebot",
            "mkdwn": true
        }
    }, function(e, r, body) {
        if (body !== "ok") console.log("Joke failed: " + body);
    })
}, function() {
    // console.log("Cron job finished");
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
                url: util.format("%s/games?ql=where%20gameId=%s", baasUrl, game.gameId),
                auth: {
                    bearer: token
                },
                json: true
            }, function(e, r, body) {
                if (e) {
                    console.log("Error: bad BaaS request:\n%s", body);
                } else {
                    if (body.count === 0) {
                        console.log(util.format("Creating new game for %s", game.gameId))
                        request.post({
                            url: util.format("%s/games", baasUrl),
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
                    } else if (!('notification' in body.entities[0]) || ('notification' in body.entities[0] && body.entities[0].notification === "failed")) {
                        if (game.groupId === defaultGroup) {
                            console.log(util.format("Re-sending notification for %s (%s)", game.gameId, body.entities[0].uuid))
                            notify(game, body.entities[0].uuid);
                        }
                    } else {
                        // console.log(util.format("Updating %s (%s)", game.gameId, body.entities[0].uuid))
                        request.put({
                            url: util.format("%s/games/%s", baasUrl, body.entities[0].uuid),
                            auth: {
                                bearer: token
                            },
                            json: true,
                            body: game
                        });
                    }
                }
            })
        },
        function(err) {
            callback(!err);
        });
}

function notify(game, uuid) {
    var relativeTime = moment(game.time).fromNow();
    var gameTime = util.format("%s PST", moment(game.time).format("MMM D, hh:mma"));
    var availableSpots = (game.maxPlayers - game.partySize) >= 0 ? game.maxPlayers - game.partySize : 0;
    var requiredLevelString = (game.requiredLevel) ? util.format("*level %s%s* ", game.requiredLevel, ((game.requiredLevel < 34) ? "+" : "")) : "";
    var guardianString = "";
    if (availableSpots > 1) {
        guardianString = util.format("need *%s* %sguardians", availableSpots, requiredLevelString);
    } else if (availableSpots = 1) {
        guardianString = util.format("need *%s* %sguardian", availableSpots, requiredLevelString);
    } else if (availableSpots <= 0) {
        guardianString = "(this game is full)";
    }
    game.channels.push("general"); // add the general channel too
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
                "text": util.format("New game by <@%s|%s> — *<%s|%s>*\nStarting *%s* (%s) — %s", game.host.name, game.host.name, game.url, game.title, relativeTime, gameTime, guardianString),
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