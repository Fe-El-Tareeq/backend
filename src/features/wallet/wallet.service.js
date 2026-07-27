const { createService } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./wallet.constants');
const repository = require('./wallet.repository');

module.exports = createService(FEATURE_NAME, repository);
