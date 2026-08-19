const { createController } = require('../../utils/featureScaffold');
const { FEATURE_NAME } = require('./locations.constants');
const service = require('./locations.service');
const ApiResponse = require('../../utils/ApiResponse');

const scaffoldController = createController(FEATURE_NAME, service);

const listActiveNeighborhoods = async (req, res, next) => {
  try {
    const neighborhoods = await service.listActiveNeighborhoods();

    return res.status(200).json(
      new ApiResponse(200, 'Active neighborhoods retrieved successfully', {
        neighborhoods,
      }),
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  ...scaffoldController,
  listActiveNeighborhoods,
};
