const { createService } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./chat.constants');
const repository = require('./chat.repository');

module.exports = createService(FEATURE_NAME, repository);
