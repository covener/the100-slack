var fs = require('fs');

function configForGroup(groupId) {
    var configForGroup = module.exports.groups[groupId.toString()];
    if (configForGroup) {
        // populate the id into the object for easy access
        configForGroup.id = parseInt(groupId);
    }
    return configForGroup;
}

module.exports = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));;
module.exports.group = configForGroup;