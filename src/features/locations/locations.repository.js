const { createRepository } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./locations.constants');

module.exports = createRepository(FEATURE_NAME);
