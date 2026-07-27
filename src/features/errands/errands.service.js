const { createService } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./errands.constants');
const repository = require('./errands.repository');

module.exports = createService(FEATURE_NAME, repository);
