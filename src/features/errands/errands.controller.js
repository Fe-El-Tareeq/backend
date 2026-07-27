const { createController } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./errands.constants');
const service = require('./errands.service');

module.exports = createController(FEATURE_NAME, service);
