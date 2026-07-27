const { createController } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./payments.constants');
const service = require('./payments.service');

module.exports = createController(FEATURE_NAME, service);
