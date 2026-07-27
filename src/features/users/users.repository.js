const { createRepository } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./users.constants');

module.exports = createRepository(FEATURE_NAME);
