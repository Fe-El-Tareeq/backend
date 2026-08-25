process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test";
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test";

const service = require("../src/features/deliveryPricing/deliveryPricing.service");

describe("Delivery pricing rules", () => {
  test("uses the same-area price", () => {
    expect(service.calculateByAreaKeys("AN_NASER", "AN_NASER")).toMatchObject({ deliveryFeeNis: 2, pricingRule: "SAME_AREA", pricingVersion: 1 });
  });

  test("uses a reviewed area override before nearby and same-zone rules", () => {
    expect(service.calculateByAreaKeys("AN_NASER", "ASH_SHEIKH_RADWAN")).toMatchObject({ deliveryFeeNis: 3, pricingRule: "AREA_OVERRIDE" });
  });

  test("uses the nearby-area price in both directions", () => {
    expect(service.calculateByAreaKeys("NORTHERN_RIMAL", "AD_DARRAJ")).toMatchObject({ deliveryFeeNis: 3, pricingRule: "NEARBY_AREA" });
    expect(service.calculateByAreaKeys("AD_DARRAJ", "NORTHERN_RIMAL")).toMatchObject({ deliveryFeeNis: 3, pricingRule: "NEARBY_AREA" });
  });

  test("uses the same-zone price for non-nearby areas", () => {
    expect(service.calculateByAreaKeys("AN_NASER", "AZ_ZAITOUN")).toMatchObject({ deliveryFeeNis: 5, pricingRule: "SAME_ZONE" });
  });

  test("uses configured cross-zone prices symmetrically", () => {
    expect(service.calculateByAreaKeys("AN_NASER", "DEIR_AL_BALAH")).toMatchObject({ deliveryFeeNis: 10, pricingRule: "ZONE_RATE" });
    expect(service.calculateByAreaKeys("DEIR_AL_BALAH", "AN_NASER")).toMatchObject({ deliveryFeeNis: 10, pricingRule: "ZONE_RATE" });
  });

  test("rejects unknown areas", () => {
    expect(() => service.calculateByAreaKeys("UNKNOWN", "AN_NASER")).toThrow("not configured");
  });
});
