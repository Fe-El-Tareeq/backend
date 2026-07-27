const { createController } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./ratings.constants');
const service = require('./ratings.service');

module.exports = createController(FEATURE_NAME, service);
