/**
 * Accuracy benchmark of the offline GPS -> country resolver against real
 * coordinates (city centres, twin border towns, disputed places). The numbers
 * are written to BENCH_OUT when that env var is set so the report can quote
 * them; the assertions are the minimum bar the shipped dataset must clear.
 *
 * Ground truth = the internationally recognised country of each point
 * (city-centre coordinates are public-record, ~±300 m).
 */
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import data from "./data/countryBoundaries.json";
import {
  buildBoundaryIndex,
  resolveCountryFix,
  type BoundaryDataset,
} from "./geometry";

const index = buildBoundaryIndex(data as unknown as BoundaryDataset);

type Case = [name: string, expected: string, lat: number, lon: number];

/** One central point per country: 44 countries. */
const CITY_CENTRES: Case[] = [
  ["Cairo", "EG", 30.0444, 31.2357],
  ["Riyadh", "SA", 24.7136, 46.6753],
  ["Dubai", "AE", 25.2048, 55.2708],
  ["Kuwait City", "KW", 29.3759, 47.9774],
  ["Doha", "QA", 25.2854, 51.531],
  ["Manama", "BH", 26.2285, 50.586],
  ["Muscat", "OM", 23.588, 58.3829],
  ["Amman", "JO", 31.9454, 35.9284],
  ["Beirut", "LB", 33.8938, 35.5018],
  ["Baghdad", "IQ", 33.3152, 44.3661],
  ["Sanaa", "YE", 15.3694, 44.191],
  ["London", "GB", 51.5074, -0.1278],
  ["Washington", "US", 38.9072, -77.0369],
  ["Paris", "FR", 48.8566, 2.3522],
  ["Berlin", "DE", 52.52, 13.405],
  ["Madrid", "ES", 40.4168, -3.7038],
  ["Rome", "IT", 41.8919, 12.5113],
  ["Amsterdam", "NL", 52.3676, 4.9041],
  ["Brussels", "BE", 50.8503, 4.3517],
  ["Lisbon", "PT", 38.7223, -9.1393],
  ["Dublin", "IE", 53.3498, -6.2603],
  ["Vienna", "AT", 48.2082, 16.3738],
  ["Warsaw", "PL", 52.2297, 21.0122],
  ["Stockholm", "SE", 59.3293, 18.0686],
  ["Athens", "GR", 37.9838, 23.7275],
  ["Ankara", "TR", 39.9334, 32.8597],
  ["Singapore", "SG", 1.3521, 103.8198],
  ["Tokyo", "JP", 35.6762, 139.6503],
  ["New Delhi", "IN", 28.6139, 77.209],
  ["Beijing", "CN", 39.9042, 116.4074],
  ["Brasilia", "BR", -15.7939, -47.8828],
  ["Buenos Aires", "AR", -34.6037, -58.3816],
  ["Mexico City", "MX", 19.4326, -99.1332],
  ["Ottawa", "CA", 45.4215, -75.6972],
  ["Canberra", "AU", -35.2809, 149.13],
  ["Pretoria", "ZA", -25.7479, 28.2293],
  ["Abuja", "NG", 9.0765, 7.3986],
  ["Nairobi", "KE", -1.2921, 36.8219],
  ["Rabat", "MA", 34.0209, -6.8416],
  ["Pristina", "XK", 42.6629, 21.1655],
  ["Bern", "CH", 46.948, 7.4474],
  ["Luxembourg", "LU", 49.6116, 6.1319],
  ["Valletta", "MT", 35.8989, 14.5146],
  ["Monaco", "MC", 43.7384, 7.4246],
];

/** Twin towns on both sides of a border (3-5 km apart): 24 points / 12 borders. */
const BORDER_TOWNS: Case[] = [
  ["Strasbourg", "FR", 48.5734, 7.7521],
  ["Kehl", "DE", 48.5728, 7.8154],
  ["Valga", "EE", 57.7778, 26.0473],
  ["Valka", "LV", 57.7745, 26.0178],
  ["Gorizia", "IT", 45.9406, 13.6203],
  ["Nova Gorica", "SI", 45.956, 13.6489],
  ["Haparanda", "SE", 65.835, 24.1385],
  ["Tornio", "FI", 65.8481, 24.1466],
  ["Brownsville", "US", 25.9017, -97.4975],
  ["Matamoros", "MX", 25.8697, -97.5028],
  ["Ciudad del Este", "PY", -25.5163, -54.6167],
  ["Foz do Iguacu", "BR", -25.5478, -54.5882],
  ["San Ysidro", "US", 32.5434, -117.0299],
  ["Tijuana", "MX", 32.5149, -117.0382],
  ["Eilat", "IL", 29.5577, 34.9519],
  ["Aqaba", "JO", 29.5321, 35.0063],
  ["Kinshasa", "CD", -4.4419, 15.2663],
  ["Brazzaville", "CG", -4.2634, 15.2429],
  ["Buchs", "CH", 47.1667, 9.475],
  ["Vaduz", "LI", 47.141, 9.5209],
  ["Windsor", "CA", 42.3149, -83.0364],
  ["Detroit", "US", 42.3314, -83.0458],
  ["Basra", "IQ", 30.5085, 47.7835],
  ["Johor Bahru", "MY", 1.4927, 103.7414],
];

/** Disputed / special places: reported, never scored as pass/fail. */
const DISPUTED: Case[] = [
  ["Jerusalem", "IL|PS", 31.7683, 35.2137],
  ["Ramallah", "PS", 31.9038, 35.2034],
  ["Gaza City", "PS", 31.5017, 34.4668],
  ["Srinagar", "IN|PK", 34.0837, 74.7973],
  ["Simferopol", "UA|RU", 44.9521, 34.1024],
  ["Laayoune", "EH|MA", 27.1253, -13.1625],
  ["Taipei", "TW", 25.033, 121.5654],
  ["Hong Kong", "HK|CN", 22.3193, 114.1694],
];

const BORDER_RISK_CASES: Array<[string, number, number, number, boolean]> = [
  // name, lat, lon, accuracy(m), expected borderRisk
  ["Cairo, 50 m", 30.0444, 31.2357, 50, false],
  ["Cairo, 5 km", 30.0444, 31.2357, 5000, false],
  ["Riyadh, 100 m", 24.7136, 46.6753, 100, false],
  ["Strasbourg, 20 km (Kehl 5 km away)", 48.5734, 7.7521, 20_000, true],
  ["Valga, 5 km (Valka 2 km away)", 57.7778, 26.0473, 5000, true],
  ["Tijuana, 10 km (US 3 km away)", 32.5149, -117.0382, 10_000, true],
  ["Singapore, 30 km (Johor 17 km away)", 1.3521, 103.8198, 30_000, true],
  ["Manama, 40 km (Saudi coast 35 km away)", 26.2285, 50.586, 40_000, true],
  ["Alexandria, 1 km (sea only)", 31.2001, 29.9187, 1000, false],
  ["Dubai, 2 km", 25.2048, 55.2708, 2000, false],
  [
    "Rio Grande: Brownsville, 20 m (border 1.4 km away in reality)",
    25.9017,
    -97.4975,
    20,
    true,
  ],
];

function score(cases: Case[]) {
  const rows = cases.map(([name, expected, lat, lon]) => {
    const fix = resolveCountryFix(index, lat, lon, 0);
    const exact = resolveCountryFix(index, lat, lon, 20); // a typical good GPS fix
    return {
      name,
      expected,
      got: fix.country,
      ok: fix.country === expected,
      // the server only treats a fix as a confirmed country when this is false
      flaggedBorderRiskAt20m: exact.borderRisk,
    };
  });
  const passed = rows.filter((r) => r.ok).length;
  return { total: rows.length, passed, rows };
}

describe("offline country resolver — accuracy benchmark", () => {
  const cities = score(CITY_CENTRES);
  const borders = score(BORDER_TOWNS);

  const disputed = DISPUTED.map(([name, expected, lat, lon]) => {
    const fix = resolveCountryFix(index, lat, lon, 0);
    return {
      name,
      accepted: expected,
      got: fix.country,
      ambiguous: fix.ambiguous,
    };
  });

  const risk = BORDER_RISK_CASES.map(([name, lat, lon, acc, expected]) => {
    const fix = resolveCountryFix(index, lat, lon, acc);
    return {
      name,
      expected,
      got: fix.borderRisk,
      ok: fix.borderRisk === expected,
    };
  });

  it("writes the numbers for the report", () => {
    const summary = {
      cityCentres: {
        total: cities.total,
        passed: cities.passed,
        failures: cities.rows.filter((r) => !r.ok),
      },
      borderTowns: {
        total: borders.total,
        passed: borders.passed,
        failures: borders.rows.filter((r) => !r.ok),
        flaggedBorderRiskAt20m: borders.rows.filter(
          (r) => r.flaggedBorderRiskAt20m,
        ).length,
        wrongAndNotFlagged: borders.rows
          .filter((r) => !r.ok && !r.flaggedBorderRiskAt20m)
          .map((r) => r.name),
      },
      cityCentresFlaggedBorderRiskAt20m: cities.rows
        .filter((r) => r.flaggedBorderRiskAt20m)
        .map((r) => r.name),
      disputed,
      borderRisk: {
        total: risk.length,
        passed: risk.filter((r) => r.ok).length,
        failures: risk.filter((r) => !r.ok),
      },
      countriesCovered: new Set(
        [...CITY_CENTRES, ...BORDER_TOWNS].map((c) => c[1]),
      ).size,
    };
    if (process.env.BENCH_OUT)
      writeFileSync(process.env.BENCH_OUT, JSON.stringify(summary, null, 2));
    expect(summary.countriesCovered).toBeGreaterThanOrEqual(30);
  });

  it("names the right country for every city centre", () => {
    expect(cities.rows.filter((r) => !r.ok)).toEqual([]);
  });

  it("names the right country on both sides of a border (3-5 km apart), or flags the fix as border-risk — never a silent wrong answer", () => {
    expect(
      borders.rows.filter((r) => !r.ok && !r.flaggedBorderRiskAt20m),
    ).toEqual([]);
  });

  it("flags / does not flag border risk as expected", () => {
    expect(risk.filter((r) => !r.ok)).toEqual([]);
  });

  it("never names a third country for a disputed place", () => {
    for (const d of disputed) {
      if (d.got) expect(d.accepted.split("|")).toContain(d.got);
    }
  });
});
