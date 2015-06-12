var express = require('express');
var request = require('request');
var util = require('util');
var async = require('async');
var apigee = require('apigee-access');
var cache = apigee.getCache('instagram');
var crypto = require('crypto');
var app = express();
var CronJob = require('cron').CronJob;
app.use(express.json());
app.use(express.urlencoded());

app.listen(8000);