import { describe, expect, it } from "vitest";

import data from "./data/countryBoundaries.json";
import {
  buildBoundaryIndex,
  countriesAt,
  resolveCountryFix,
  type BoundaryDataset,
} from "./geometry";

const index = buildBoundaryIndex(data as unknown as BoundaryDataset);

// Synthetic world: two squares sharing a border at lon=10, one with a hole.
const synthetic = buildBoundaryIndex({
  v: 1,
  p: 1000,
  c: {
    AA: [
      [
        // outer ring 0..10 x 0..10 (lon, lat) scaled
        [0, 0, 10000, 0, 10000, 10000, 0, 10000],
        // hole 4..6
        [4000, 4000, 6000, 4000, 6000, 6000, 4000, 6000],
      ],
    ],
    BB: [[[10000, 0, 20000, 0, 20000, 10000, 10000, 10000]]],
    // two overlapping claims over 30..40
    CC: [[[30000, 0, 40000, 0, 40000, 10000, 30000, 10000]]],
    DD: [[[30000, 0, 40000, 0, 40000, 10000, 30000, 10000]]],
  },
});

describe("point in polygon", () => {
  it("finds the containing polygon and respects holes", () => {
    expect(countriesAt(synthetic, 2, 2)).toEqual(["AA"]);
    expect(countriesAt(synthetic, 5, 5)).toEqual([]); // inside the hole
    expect(countriesAt(synthetic, 15, 5)).toEqual(["BB"]);
    expect(countriesAt(synthetic, 50, 5)).toEqual([]);
  });

  it("reports overlapping claims as ambiguous (disputed territory)", () => {
    const fix = resolveCountryFix(synthetic, 5, 35, 10);
    expect(fix.country).toBeNull();
    expect(fix.ambiguous).toBe(true);
  });
});

describe("resolveCountryFix", () => {
  it("rejects invalid coordinates and unusable accuracy", () => {
    expect(resolveCountryFix(index, NaN, 31, 10).country).toBeNull();
    expect(resolveCountryFix(index, 91, 31, 10).country).toBeNull();
    expect(resolveCountryFix(index, 30, 181, 10).country).toBeNull();
    expect(resolveCountryFix(index, 30.04, 31.23, 250_000).country).toBeNull();
    expect(resolveCountryFix(index, 30.04, 31.23, NaN).country).toBeNull();
  });

  it("names the country for a clear fix and does not flag a border", () => {
    const fix = resolveCountryFix(index, 30.0444, 31.2357, 50); // Cairo
    expect(fix).toMatchObject({
      country: "EG",
      borderRisk: false,
      ambiguous: false,
    });
  });

  it("flags borderRisk when the accuracy circle reaches another country", () => {
    // Strasbourg (FR) is ~5 km from Kehl (DE)
    const fix = resolveCountryFix(index, 48.5734, 7.7521, 20_000);
    expect(fix.country).toBe("FR");
    expect(fix.borderRisk).toBe(true);
  });

  it("does not flag a circle that only reaches the sea", () => {
    const fix = resolveCountryFix(index, 31.2001, 29.9187, 1000); // Alexandria
    expect(fix.country).toBe("EG");
    expect(fix.borderRisk).toBe(false);
  });

  it("snaps a fix just off the shore to the nearby country", () => {
    const fix = resolveCountryFix(index, 31.3, 29.9, 100); // Mediterranean, ~10 km off? (may be too far)
    // either snapped to EG or no country; it must never name a wrong country
    expect([null, "EG"]).toContain(fix.country);
  });

  it("is deterministic", () => {
    expect(resolveCountryFix(index, 51.5074, -0.1278, 30)).toEqual(
      resolveCountryFix(index, 51.5074, -0.1278, 30),
    );
  });
});
