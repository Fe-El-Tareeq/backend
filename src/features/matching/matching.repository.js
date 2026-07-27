const { createRepository } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./matching.constants');

module.exports = createRepository(FEATURE_NAME);
