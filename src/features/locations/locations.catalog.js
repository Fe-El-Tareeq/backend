const areasConfig = require("../../data/gaza-areas.json");

const cities = Object.freeze(
  areasConfig.zones.map((zone) =>
    Object.freeze({
      key: zone.key,
      nameAr: zone.nameAr,
      nameEn: zone.nameEn,
      neighborhoodsCount: zone.areas.length,
    }),
  ),
);

const cityKeys = Object.freeze(cities.map((city) => city.key));

const findCityByKey = (key) => cities.find((city) => city.key === key) || null;

module.exports = {
  cities,
  cityKeys,
  findCityByKey,
};
