const { createController } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./users.constants');
const service = require('./users.service');

module.exports = createController(FEATURE_NAME, service);
