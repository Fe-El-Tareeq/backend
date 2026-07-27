const { createController } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./admin.constants');
const service = require('./admin.service');

module.exports = createController(FEATURE_NAME, service);
