const { createService } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./locations.constants');
const repository = require('./locations.repository');

const scaffoldService = createService(FEATURE_NAME, repository);

const listActiveNeighborhoods = async () => {
  return repository.findActiveNeighborhoods();
};

module.exports = {
  ...scaffoldService,
  listActiveNeighborhoods,
};
