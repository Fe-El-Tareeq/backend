const { createController } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./matching.constants');
const service = require('./matching.service');

module.exports = createController(FEATURE_NAME, service);
