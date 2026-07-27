const { createRepository } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./chat.constants');

module.exports = createRepository(FEATURE_NAME);
