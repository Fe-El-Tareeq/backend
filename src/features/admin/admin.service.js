const { createService } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./admin.constants');
const repository = require('./admin.repository');

module.exports = createService(FEATURE_NAME, repository);
