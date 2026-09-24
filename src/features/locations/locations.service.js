const { createService } = require("../../utils/featureScaffold");
const { FEATURE_NAME } = require("./locations.constants");
const repository = require("./locations.repository");
const {
  cities,
  getAreaKeysForZone,
  getZoneForArea,
} = require("./locations.catalog");

const scaffoldService = createService(FEATURE_NAME, repository);

const listCities = () => cities;

const listActiveNeighborhoods = async (zoneKey) => {
  const neighborhoods = await repository.findActiveNeighborhoods(
    zoneKey ? { areaKeys: getAreaKeysForZone(zoneKey) } : undefined,
  );

  return neighborhoods.map((neighborhood) => ({
    ...neighborhood,
    zoneKey: getZoneForArea(neighborhood.key)?.key || null,
  }));
};

module.exports = {
  ...scaffoldService,
  listCities,
  listActiveNeighborhoods,
};
