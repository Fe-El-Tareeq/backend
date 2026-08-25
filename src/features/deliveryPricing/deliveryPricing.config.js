const areasConfig = require("../../data/gaza-areas.json");
const pricingConfig = require("../../data/gaza-delivery-pricing.json");

const assert = (condition, message) => {
  if (!condition) throw new Error(`Invalid delivery pricing configuration: ${message}`);
};

assert(pricingConfig.status === "APPROVED", "status must be APPROVED");
assert(Number.isInteger(pricingConfig.pricingVersion) && pricingConfig.pricingVersion > 0, "pricingVersion must be a positive integer");

const areaByKey = new Map();
const zoneByAreaKey = new Map();
for (const zone of areasConfig.zones) {
  for (const area of zone.areas) {
    assert(!areaByKey.has(area.key), `duplicate area key ${area.key}`);
    areaByKey.set(area.key, area);
    zoneByAreaKey.set(area.key, zone.key);
  }
}

const validateFee = (fee, label) => {
  const { minimumDeliveryFeeNis: min, maximumDeliveryFeeNis: max } = pricingConfig.constraints;
  assert(Number.isInteger(fee) && fee >= min && fee <= max, `${label} must be an integer between ${min} and ${max}`);
};

for (const [name, rule] of Object.entries(pricingConfig.defaultRules)) validateFee(rule.deliveryFeeNis, name);
for (const rate of pricingConfig.zoneRates) validateFee(rate.deliveryFeeNis, "zone rate");
for (const rate of pricingConfig.areaOverrides) {
  assert(areaByKey.has(rate.firstAreaKey) && areaByKey.has(rate.secondAreaKey), "override references unknown area");
  validateFee(rate.deliveryFeeNis, "area override");
}

const pairKey = (first, second) => [first, second].sort().join("::");
const zonePairs = new Set();
for (const rate of pricingConfig.zoneRates) {
  const key = pairKey(rate.firstZoneKey, rate.secondZoneKey);
  assert(!zonePairs.has(key), `duplicate zone rate ${key}`);
  zonePairs.add(key);
}
const areaPairs = new Set();
for (const rate of pricingConfig.areaOverrides) {
  const key = pairKey(rate.firstAreaKey, rate.secondAreaKey);
  assert(!areaPairs.has(key), `duplicate area override ${key}`);
  areaPairs.add(key);
}

module.exports = { areasConfig, pricingConfig, areaByKey, zoneByAreaKey };
