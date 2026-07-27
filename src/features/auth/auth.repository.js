const { createRepository } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./auth.constants');

module.exports = createRepository(FEATURE_NAME);
