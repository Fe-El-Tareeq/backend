const { createRepository } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./trips.constants');

module.exports = createRepository(FEATURE_NAME);
