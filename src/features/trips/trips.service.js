const { createService } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./trips.constants');
const repository = require('./trips.repository');

module.exports = createService(FEATURE_NAME, repository);
