const { createController } = require("../../utils/featureScaffold");
const { FEATURE_NAME } = require("./locations.constants");
const service = require("./locations.service");
const ApiResponse = require("../../utils/ApiResponse");

const scaffoldController = createController(FEATURE_NAME, service);

const listCities = async (req, res, next) => {
  try {
    const cities = service.listCities();

    return res.status(200).json(
      new ApiResponse(200, "Supported cities retrieved successfully", {
        cities,
      }),
    );
  } catch (error) {
    next(error);
  }
};

const listActiveNeighborhoods = async (req, res, next) => {
  try {
    const neighborhoods = await service.listActiveNeighborhoods(
      req.validatedData.query.city,
    );

    return res.status(200).json(
      new ApiResponse(200, "Active neighborhoods retrieved successfully", {
        neighborhoods,
      }),
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  ...scaffoldController,
  listCities,
  listActiveNeighborhoods,
};
