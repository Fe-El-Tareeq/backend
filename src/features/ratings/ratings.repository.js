const { createRepository } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./ratings.constants');

module.exports = createRepository(FEATURE_NAME);
