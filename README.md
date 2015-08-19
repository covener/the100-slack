# the100 > slack webhook notifier

This utility scrapes games from [the100](https://www.the100.io), translates them into a structured JSON datasource, and sends notifications to Slack by way of webhooks. To get started, clone the repo, and start by creating `config.json` (you can use `config-example.json` as a template):

	{
	    "apigeeBaseUrl": "https://api.usergrid.com/path",
	    "apigeeClientId": "xxxx_xxxxxxxxxxxxxxx",
	    "apigeeClientSecret": "xxxxxxxxxxxx-xxxxxxxxxxxxx",
	    "defaultMaps": {
	        "gameTitleChannelMap": {
	            "Crota's End": "crota-raid",
	            "Prison of Elders": "prison-of-elders",
	            "Vault of Glass": "vog-raid"
	        },
	        "keywordChannelMap": {
	            "sherpa": "sherpa-station"
	        }
	    },
	    "groups": {
	        "12345": {
	            "authToken": "xxxx-xxxxxxxxxx",
	            "gameTitleChannelMap": {
	                "Miscellaneous": "up-for-anything"
	            },
	            "keywordChannelMap": {
	                "some regex patterns?": "some-channel"
	            },
	            "name": "Alpha Company 12345",
	            "slackWebhookUrl": "https://hooks.slack.com/services/foo/bar/baz"
	        },
	        "54321": {
	            
	        }
	    },
	    "logging": true
	}
	
You'll require at least one Slack group, and a (free) account with [Apigee BaaS](https://appservices.apigee.com) to store game data. Questions or problems? Please use the issues. Pull requests are welcome!
