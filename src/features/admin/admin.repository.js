const { createRepository } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./admin.constants');

module.exports = createRepository(FEATURE_NAME);
