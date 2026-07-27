const { createRepository } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./errands.constants');

module.exports = createRepository(FEATURE_NAME);
