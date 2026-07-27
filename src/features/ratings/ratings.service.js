const { createService } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./ratings.constants');
const repository = require('./ratings.repository');

module.exports = createService(FEATURE_NAME, repository);
