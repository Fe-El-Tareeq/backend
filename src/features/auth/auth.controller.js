const { createController } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./auth.constants');
const service = require('./auth.service');

module.exports = createController(FEATURE_NAME, service);
