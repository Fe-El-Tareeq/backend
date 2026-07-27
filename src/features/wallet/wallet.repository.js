const { createRepository } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./wallet.constants');

module.exports = createRepository(FEATURE_NAME);
