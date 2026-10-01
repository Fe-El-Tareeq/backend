const {
  getZones,
  getZoneForArea,
  getAreasForZone,
  getCompatibleAreaKeys,
} = require("../src/features/locations/locations.catalog");

describe("location catalog", () => {
  test("contains six unique zones and globally unique areas", () => {
    const zones = getZones();
    const zoneKeys = zones.map((zone) => zone.key);
    const areaKeys = zones.flatMap((zone) => zone.areas.map((area) => area.key));

    expect(zoneKeys).toEqual([
      "NORTH_GAZA",
      "GAZA_CITY",
      "MIDDLE_AREA",
      "DEIR_AL_BALAH",
      "KHAN_YUNIS",
      "RAFAH",
    ]);
    expect(new Set(zoneKeys).size).toBe(6);
    expect(new Set(areaKeys).size).toBe(areaKeys.length);
  });

  test("all nearby area references resolve", () => {
    const areaKeys = new Set(
      getZones().flatMap((zone) => zone.areas.map((area) => area.key)),
    );

    for (const zone of getZones()) {
      for (const area of zone.areas) {
        expect((area.nearbyAreas || []).every((key) => areaKeys.has(key))).toBe(true);
      }
    }
  });

  test("resolves zones, areas, and compatibility", () => {
    expect(getZoneForArea("ASH_SHUJAIYEH").key).toBe("GAZA_CITY");
    expect(getAreasForZone("RAFAH").map((area) => area.key)).toContain("RAFAH_CITY");
    expect(getCompatibleAreaKeys("BEIT_LAHIA")).toEqual(
      expect.arrayContaining(["BEIT_LAHIA", "JABALIA"]),
    );
    expect(getCompatibleAreaKeys("RAFAH_CITY")).not.toContain("BEIT_LAHIA");
  });
});
