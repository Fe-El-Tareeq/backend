const { createService } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./auth.constants');
const repository = require('./auth.repository');

module.exports = createService(FEATURE_NAME, repository);
