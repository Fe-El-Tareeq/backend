const { createController } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./wallet.constants');
const service = require('./wallet.service');

module.exports = createController(FEATURE_NAME, service);
