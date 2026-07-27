const { createService } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./matching.constants');
const repository = require('./matching.repository');

module.exports = createService(FEATURE_NAME, repository);
