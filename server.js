var express = require('express');
var request = require('request');
var util = require('util');
var async = require('async');
var apigee = require('apigee-access');
var cache = apigee.getCache('the100');
var app = express();
var CronJob = require('cron').CronJob;

app.get('/', function(req, res) {
    var fullUrl = util.format("%s://%s%s", req.protocol, req.get('host'), req.originalUrl);
    res.json({hint: util.format("Append a url segment with a group ID from the100.io, e.g. %s100", fullUrl)})
});

app.get('/:group', function(req, res) {
    var python = require('child_process').spawn(
        'python',
        // second argument is array of parameters, e.g.:
        ["scrape.py", req.params.group]
    );
    var output = "";
    python.stdout.on('data', function(data) {
        output += data
    });
    python.on('close', function(code) {
        if (code !== 0) {
            return res.status(500).json({error: "Error loading web data."})
        }
        output = JSON.parse(output)
        return res.json(output)
    });
});

app.listen(8000);