const { createRepository } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./notifications.constants');

module.exports = createRepository(FEATURE_NAME);
