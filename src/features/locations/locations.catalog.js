const areasConfig = require("../../data/gaza-areas.json");

const zones = Object.freeze(
  areasConfig.zones.map((zone) =>
    Object.freeze({
      ...zone,
      areas: Object.freeze(zone.areas.map((area) => Object.freeze({ ...area }))),
    }),
  ),
);

const zoneByKey = new Map();
const areaByKey = new Map();
const zoneByAreaKey = new Map();

for (const zone of zones) {
  if (zoneByKey.has(zone.key)) {
    throw new Error(`Invalid location catalog: duplicate zone key ${zone.key}`);
  }
  zoneByKey.set(zone.key, zone);

  for (const area of zone.areas) {
    if (areaByKey.has(area.key)) {
      throw new Error(`Invalid location catalog: duplicate area key ${area.key}`);
    }
    areaByKey.set(area.key, area);
    zoneByAreaKey.set(area.key, zone.key);
  }
}

for (const area of areaByKey.values()) {
  for (const nearbyAreaKey of area.nearbyAreas || []) {
    if (!areaByKey.has(nearbyAreaKey)) {
      throw new Error(
        `Invalid location catalog: ${area.key} references unknown nearby area ${nearbyAreaKey}`,
      );
    }
  }
}

const cities = Object.freeze(
  zones.map((zone) =>
    Object.freeze({
      key: zone.key,
      nameAr: zone.nameAr,
      nameEn: zone.nameEn,
      neighborhoodsCount: zone.areas.length,
    }),
  ),
);

const zoneKeys = Object.freeze(zones.map((zone) => zone.key));
const cityKeys = zoneKeys;

const getZones = () => zones;
const getZoneByKey = (key) => zoneByKey.get(key) || null;
const findCityByKey = (key) => cities.find((city) => city.key === key) || null;
const getAreaByKey = (key) => areaByKey.get(key) || null;
const getAreasForZone = (zoneKey) => getZoneByKey(zoneKey)?.areas || [];
const getZoneForArea = (areaKey) => getZoneByKey(zoneByAreaKey.get(areaKey));
const getAreaKeysForZone = (zoneKey) =>
  getAreasForZone(zoneKey).map((area) => area.key);
const isAreaInZone = (areaKey, zoneKey) =>
  zoneByAreaKey.get(areaKey) === zoneKey;
const getCompatibleAreaKeys = (areaKey) => {
  const area = getAreaByKey(areaKey);
  if (!area) return [];

  const reverseNearby = [...areaByKey.values()]
    .filter((candidate) => (candidate.nearbyAreas || []).includes(areaKey))
    .map((candidate) => candidate.key);

  return [...new Set([areaKey, ...(area.nearbyAreas || []), ...reverseNearby])];
};
const findCityByGovernorate = (governorate) =>
  cities.find((city) => city.nameAr === governorate) || null;

module.exports = {
  areasConfig,
  zones,
  cities,
  zoneKeys,
  cityKeys,
  areaByKey,
  zoneByAreaKey,
  getZones,
  getZoneByKey,
  findCityByKey,
  getAreaByKey,
  getAreasForZone,
  getZoneForArea,
  getAreaKeysForZone,
  isAreaInZone,
  getCompatibleAreaKeys,
  findCityByGovernorate,
};
