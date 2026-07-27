const { createService } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./payments.constants');
const repository = require('./payments.repository');

module.exports = createService(FEATURE_NAME, repository);
