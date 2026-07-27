const { createService } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./notifications.constants');
const repository = require('./notifications.repository');

module.exports = createService(FEATURE_NAME, repository);
