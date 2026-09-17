const { createService } = require("../../utils/featureScaffold");
const { FEATURE_NAME } = require("./locations.constants");
const repository = require("./locations.repository");
const { cities, findCityByKey } = require("./locations.catalog");
const ApiError = require("../../utils/ApiError");

const scaffoldService = createService(FEATURE_NAME, repository);

const listCities = () => cities;

const listActiveNeighborhoods = async (cityKey) => {
  if (!cityKey) {
    return repository.findActiveNeighborhoods();
  }

  const city = findCityByKey(cityKey);
  if (!city) {
    throw new ApiError(400, "Unsupported city.");
  }

  return repository.findActiveNeighborhoods({
    governorate: city.nameAr,
  });
};

module.exports = {
  ...scaffoldService,
  listCities,
  listActiveNeighborhoods,
};
