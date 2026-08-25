const ApiError = require("../../utils/ApiError");
const repository = require("./deliveryPricing.repository");
const { pricingConfig, areaByKey, zoneByAreaKey } = require("./deliveryPricing.config");

const unorderedPairMatches = (first, second, left, right, bidirectional = true) =>
  (first === left && second === right) || (bidirectional && first === right && second === left);

const calculateByAreaKeys = (originAreaKey, destinationAreaKey) => {
  const origin = areaByKey.get(originAreaKey);
  const destination = areaByKey.get(destinationAreaKey);
  if (!origin || !destination) throw new ApiError(422, "Delivery pricing is not configured for one or both areas.");

  const override = pricingConfig.areaOverrides.find((rate) =>
    unorderedPairMatches(originAreaKey, destinationAreaKey, rate.firstAreaKey, rate.secondAreaKey, rate.bidirectional),
  );
  if (override) return result(override.deliveryFeeNis, "AREA_OVERRIDE");
  if (originAreaKey === destinationAreaKey) return result(pricingConfig.defaultRules.sameArea.deliveryFeeNis, "SAME_AREA");
  if (origin.nearbyAreas.includes(destinationAreaKey) || destination.nearbyAreas.includes(originAreaKey)) {
    return result(pricingConfig.defaultRules.nearbyArea.deliveryFeeNis, "NEARBY_AREA");
  }

  const originZone = zoneByAreaKey.get(originAreaKey);
  const destinationZone = zoneByAreaKey.get(destinationAreaKey);
  if (originZone === destinationZone) return result(pricingConfig.defaultRules.sameZone.deliveryFeeNis, "SAME_ZONE");

  const zoneRate = pricingConfig.zoneRates.find((rate) =>
    unorderedPairMatches(originZone, destinationZone, rate.firstZoneKey, rate.secondZoneKey, rate.bidirectional),
  );
  if (zoneRate) return result(zoneRate.deliveryFeeNis, "ZONE_RATE");
  throw new ApiError(422, pricingConfig.missingPriceBehavior.messageEn);
};

const result = (deliveryFeeNis, pricingRule) => ({
  deliveryFeeNis,
  pricingRule,
  pricingVersion: pricingConfig.pricingVersion,
  currency: pricingConfig.currency,
});

const quoteByNeighborhoodIds = async (originNeighborhoodId, destinationNeighborhoodId, client) => {
  const [originNeighborhood, destinationNeighborhood] = await Promise.all([
    repository.findActiveNeighborhoodById(originNeighborhoodId, client),
    repository.findActiveNeighborhoodById(destinationNeighborhoodId, client),
  ]);
  if (!originNeighborhood) throw new ApiError(400, "Origin neighborhood is missing, inactive, or invalid.");
  if (!destinationNeighborhood) throw new ApiError(400, "Destination neighborhood is missing, inactive, or invalid.");
  if (!originNeighborhood.key || !destinationNeighborhood.key) {
    throw new ApiError(422, "Delivery pricing is not configured for one or both neighborhoods.");
  }
  return {
    originNeighborhood,
    destinationNeighborhood,
    ...calculateByAreaKeys(originNeighborhood.key, destinationNeighborhood.key),
  };
};

module.exports = { calculateByAreaKeys, quoteByNeighborhoodIds };
