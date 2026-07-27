const { createService } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./locations.constants');
const repository = require('./locations.repository');

module.exports = createService(FEATURE_NAME, repository);
