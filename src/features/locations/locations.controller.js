const { createController } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./locations.constants');
const service = require('./locations.service');

module.exports = createController(FEATURE_NAME, service);
