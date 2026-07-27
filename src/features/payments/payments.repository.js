const { createRepository } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./payments.constants');

module.exports = createRepository(FEATURE_NAME);
