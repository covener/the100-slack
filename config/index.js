var fs = require('fs');
var util = require('util');

function configForGroup(groupId) {
    var groupConfig = module.exports.groups[groupId.toString()];
    if (groupConfig) {
        // populate the id into the object for easy access
        groupConfig.id = parseInt(groupId);
    }
    return groupConfig;
}

module.exports = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));
module.exports.apigeeUri = util.format("https://api.usergrid.com/%s/%s", module.exports.apigeeOrg, module.exports.apigeeApp);
module.exports.group = configForGroup;