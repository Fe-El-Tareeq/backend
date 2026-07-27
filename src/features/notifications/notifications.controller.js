const { createController } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./notifications.constants');
const service = require('./notifications.service');

module.exports = createController(FEATURE_NAME, service);
