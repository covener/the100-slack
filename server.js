var the100 = require('./lib/the100');
var config = require('./config');

var async = require('async');
var express = require('express');
var util = require('util');
var moment = require('moment');
var app = express();
var cron = require('cron').CronJob;
var Log = require('log'),
    log = new Log(config.logLevel)

app.get('/', function(req, res) {
    var fullUrl = util.format("%s://%s%s", req.protocol, req.get('host'), req.originalUrl);
    res.json({
        hint: util.format("Append a url segment with a group ID from the100.io, e.g. %s100", fullUrl)
    })
});

app.get('/:group', function(req, res) {
    var groupConfig = config.group(req.params.group.toString());
    if (groupConfig) {
        the100.getData(groupConfig, function(err, results) {
            if (err) {
                res.status(500).json({
                    error: "Failed to load web data"
                });
            } else {
                if (err) {
                    log.error(util.format("Error: %s", err));
                    res.status(500).json({
                        error: "Failed to scrape web data"
                    });
                } else {
                    the100.processData(groupConfig, results);
                    res.json(results.scrape);
                }
            }
        });
    } else {
        res.status(400).json({
            error: util.format("Group %s not found.", groupid)
        });
    }
});

new cron('*/20 * * * * *', function() {
    log.debug("Running cron job");
    async.each(Object.keys(config.groups), function(groupId) {
        var groupConfig = config.group(groupId);
        groupConfig.groupId = groupId;
        the100.getData(groupConfig, function(err, results) {
            if (err) {
                log.error(util.format("%s", err));
            } else {
                the100.processData(groupConfig, results);
            }
        });
    });
}, null, true);

app.listen(process.env.PORT || 8000, function() {
    log.info("Server initialized")
});