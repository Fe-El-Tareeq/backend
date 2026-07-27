const { createController } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./chat.constants');
const service = require('./chat.service');

module.exports = createController(FEATURE_NAME, service);
