const { createController } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./trips.constants');
const service = require('./trips.service');

module.exports = createController(FEATURE_NAME, service);
