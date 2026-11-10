/* eslint-disable */
/**
 * Builds src/lib/regional/data/countryBoundaries.json — the offline
 * country-boundary dataset the browser uses to turn a GPS fix into an ISO
 * country code WITHOUT sending the coordinates anywhere.
 *
 * Source: Natural Earth 1:10m (public domain) via the `world-atlas` npm
 * package (ISC). 1:50m was tried first and rejected: it displaces some
 * borders by more than 2 km and omits tiny states (Monaco, Vatican, ...).
 *
 *   npm i --no-save world-atlas topojson-client topojson-simplify
 *   node scripts/regional/generate-country-boundaries.cjs <backend countries.data.ts>
 *
 * Output: { v:1, p:1000, c:{ "EG": [ [ring, ring..], ...polygons ] } }
 * where every ring is a flat [lon*1000, lat*1000, ...] integer array
 * (~110 m grid; the border-risk check, not this precision, is what protects
 * borderline fixes).
 */
const fs = require("fs");
const path = require("path");
const topo = require("topojson-client");
const simp = require("topojson-simplify");
const atlas10 = require("world-atlas/countries-10m.json");

const seedPath = process.argv[2];
const seed = fs.readFileSync(seedPath, "utf8");
const numericToAlpha2 = {};
for (const m of seed.matchAll(
  /code:\s*['"](\w\w)['"][\s\S]*?numeric:\s*['"](\d{3})['"]/g,
)) {
  numericToAlpha2[m[2]] = m[1];
}
// Features without an ISO numeric id in Natural Earth.
const NAME_TO_ALPHA2 = {
  Kosovo: "XK",
  Somaliland: "SO", // internationally part of Somalia
  "N. Cyprus": "CY", // internationally part of Cyprus
};
// 'Indian Ocean Ter.' and 'Siachen Glacier' are intentionally dropped:
// disputed / multi-territory, they must not produce a confident country.

const P = 1000;
const round = (n) => Math.round(n * P);

/**
 * A ring that crosses the antimeridian jumps from +180 to -180 (or back).
 * Planar ray-casting needs a continuous ring, so longitudes are "unwrapped"
 * (+/-360 added after each jump). If the ring cannot be closed that way
 * (it encircles a pole, i.e. Antarctica) it is left untouched.
 */
function unwrapRing(ring) {
  const out = [];
  let offset = 0;
  let prev = null;
  for (const [lon, lat] of ring) {
    if (prev !== null) {
      const d = lon + offset - prev;
      if (d > 180) offset -= 360;
      else if (d < -180) offset += 360;
    }
    const x = lon + offset;
    out.push([x, lat]);
    prev = x;
  }
  const first = out[0][0];
  const last = out[out.length - 1][0];
  return Math.abs(last - first) < 1e-6 ? out : ring;
}

function toFlat(ring) {
  const flat = [];
  let px, py;
  for (const [lon, lat] of ring) {
    const x = round(lon),
      y = round(lat);
    if (x === px && y === py) continue; // drop duplicates after rounding
    flat.push(x, y);
    px = x;
    py = y;
  }
  return flat;
}

function ringsOf(geom) {
  // geom: GeoJSON Polygon|MultiPolygon -> array of polygons (each array of rings)
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const result = [];
  for (const poly of polys) {
    const rings = poly.map(unwrapRing);
    const outerMax = Math.max(...rings[0].map((p) => p[0]));
    const outerMin = Math.min(...rings[0].map((p) => p[0]));
    const flat = rings.map(toFlat).filter((r) => r.length >= 6);
    if (!flat.length) continue;
    result.push(flat);
    // Unwrapped polygon that reaches past +180 / -180: also publish the copy
    // shifted by 360 so points on the other side of the antimeridian match.
    if (outerMax > 180 || outerMin < -180) {
      const shift = outerMax > 180 ? -360 : 360;
      result.push(
        rings
          .map((r) => toFlat(r.map(([x, y]) => [x + shift, y])))
          .filter((r) => r.length >= 6),
      );
    }
  }
  return result;
}

// Topology-preserving simplification (shared borders are simplified once, so
// neighbours never overlap or leave gaps). KEEP = quantile of the smallest
// triangle weights that are dropped.
const KEEP = Number(process.env.KEEP || 0.3);
const pre = simp.presimplify(atlas10);
const simplified = simp.simplify(pre, simp.quantile(pre, KEEP));

// Polygons whose bounding box is smaller than this (degrees) are islands and
// micro-states: never simplified, so none of them can degenerate or vanish.
const SMALL_SPAN_DEG = Number(process.env.SMALL_SPAN || 1.5);
const spanOf = (flatRing) => {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < flatRing.length; i += 2) {
    minX = Math.min(minX, flatRing[i]);
    maxX = Math.max(maxX, flatRing[i]);
    minY = Math.min(minY, flatRing[i + 1]);
    maxY = Math.max(maxY, flatRing[i + 1]);
  }
  return Math.max(maxX - minX, maxY - minY) / P;
};

function collect(atlas, keep) {
  const result = {};
  const fc = topo.feature(atlas, atlas.objects.countries);
  for (const f of fc.features) {
    const code =
      f.id != null
        ? numericToAlpha2[String(f.id).padStart(3, "0")]
        : NAME_TO_ALPHA2[f.properties.name];
    if (!code) continue;
    for (const poly of ringsOf(f.geometry)) {
      if (keep(spanOf(poly[0]))) (result[code] = result[code] || []).push(poly);
    }
  }
  return result;
}

const out = {};
const large = collect(simplified, (span) => span >= SMALL_SPAN_DEG);
const small = collect(atlas10, (span) => span < SMALL_SPAN_DEG);
for (const code of new Set([...Object.keys(large), ...Object.keys(small)])) {
  out[code] = [...(large[code] || []), ...(small[code] || [])];
}

// A country can appear via two Natural Earth features (e.g. Somaliland + Somalia).
const codes = Object.keys(out).sort();
const result = {
  v: 1,
  p: P,
  c: Object.fromEntries(codes.map((c) => [c, out[c]])),
};
const target = path.join(
  __dirname,
  "..",
  "..",
  "src",
  "lib",
  "regional",
  "data",
  "countryBoundaries.json",
);
fs.writeFileSync(target, JSON.stringify(result));

const missing = Object.values(numericToAlpha2)
  .filter((c) => !out[c])
  .sort();
console.log(
  JSON.stringify({
    countriesWithBoundaries: codes.length,
    withoutBoundaries: missing,
    bytes: fs.statSync(target).size,
  }),
);
