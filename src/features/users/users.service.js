const { createService } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./users.constants');
const repository = require('./users.repository');

module.exports = createService(FEATURE_NAME, repository);
