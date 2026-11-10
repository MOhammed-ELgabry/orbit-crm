/**
 * Offline country resolution from a point: ray-casting point-in-polygon over
 * the bundled Natural Earth boundaries, plus the "does the accuracy circle
 * reach another country?" border-risk check. Pure functions: nothing here
 * touches the network, storage or the DOM.
 *
 * Dataset layout (see scripts/regional/generate-country-boundaries.cjs):
 *   { p: 1000, c: { EG: [ polygon, ... ] } } where a polygon is an array of
 *   rings and a ring a flat integer array [lon*p, lat*p, lon*p, lat*p, ...].
 */

export interface BoundaryDataset {
  v: number;
  /** Integer grid: degrees * p. */
  p: number;
  c: Record<string, number[][][]>;
}

interface IndexedPolygon {
  code: string;
  rings: number[][];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface BoundaryIndex {
  scale: number;
  polygons: IndexedPolygon[];
}

export function buildBoundaryIndex(dataset: BoundaryDataset): BoundaryIndex {
  const polygons: IndexedPolygon[] = [];

  for (const [code, polys] of Object.entries(dataset.c)) {
    for (const rings of polys) {
      const outer = rings[0];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < outer.length; i += 2) {
        const x = outer[i];
        const y = outer[i + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      polygons.push({ code, rings, minX, minY, maxX, maxY });
    }
  }

  return { scale: dataset.p, polygons };
}

/** Even-odd rule across the outer ring and its holes. */
function insidePolygon(rings: number[][], x: number, y: number): boolean {
  let inside = false;

  for (const ring of rings) {
    const n = ring.length;
    let j = n - 2;
    for (let i = 0; i < n; i += 2) {
      const xi = ring[i];
      const yi = ring[i + 1];
      const xj = ring[j];
      const yj = ring[j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
      j = i;
    }
  }

  return inside;
}

/** Every country whose polygons contain the point (usually exactly one). */
export function countriesAt(
  index: BoundaryIndex,
  lon: number,
  lat: number,
): string[] {
  const x = lon * index.scale;
  const y = lat * index.scale;
  const found = new Set<string>();

  for (const poly of index.polygons) {
    if (x < poly.minX || x > poly.maxX || y < poly.minY || y > poly.maxY)
      continue;
    if (found.has(poly.code)) continue;
    if (insidePolygon(poly.rings, x, y)) found.add(poly.code);
  }

  return [...found];
}

const EARTH_METERS_PER_DEGREE = 111_320;

/** Point at `distanceM` metres from (lat, lon) along `bearingRad` (flat-earth, fine for <100 km). */
function offsetPoint(
  lat: number,
  lon: number,
  distanceM: number,
  bearingRad: number,
): { lat: number; lon: number } {
  const dLat = (distanceM * Math.cos(bearingRad)) / EARTH_METERS_PER_DEGREE;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const dLon =
    (distanceM * Math.sin(bearingRad)) / (EARTH_METERS_PER_DEGREE * cosLat);

  let newLon = lon + dLon;
  if (newLon > 180) newLon -= 360;
  if (newLon < -180) newLon += 360;

  return { lat: Math.max(-90, Math.min(90, lat + dLat)), lon: newLon };
}

/** Distance (degrees, planar) from a point to the nearest edge of a ring set. */
function distanceToRingsDeg(
  rings: number[][],
  x: number,
  y: number,
  scale: number,
  cosLat: number,
): number {
  let best = Infinity;

  for (const ring of rings) {
    const n = ring.length;
    let j = n - 2;
    for (let i = 0; i < n; i += 2) {
      const ax = ring[j] / scale;
      const ay = ring[j + 1] / scale;
      const bx = ring[i] / scale;
      const by = ring[i + 1] / scale;
      j = i;

      const px = x / scale;
      const py = y / scale;
      const dx = (bx - ax) * cosLat;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t =
        len2 === 0 ? 0 : ((px - ax) * cosLat * dx + (py - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = ax * cosLat + dx * t;
      const cy = ay + dy * t;
      const ex = px * cosLat - cx;
      const ey = py - cy;
      const d = Math.sqrt(ex * ex + ey * ey);
      if (d < best) best = d;
    }
  }

  return best;
}

/**
 * The nearest country within `maxMeters` of a point that lies in no polygon
 * (a fix on the shore, a pier, a ship in territorial waters).
 */
export function nearestCountryWithin(
  index: BoundaryIndex,
  lon: number,
  lat: number,
  maxMeters: number,
): string | null {
  const maxDeg = maxMeters / EARTH_METERS_PER_DEGREE;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const pad = maxDeg * index.scale * 1.5;
  const x = lon * index.scale;
  const y = lat * index.scale;

  let bestCode: string | null = null;
  let bestDist = maxDeg;

  for (const poly of index.polygons) {
    if (
      x < poly.minX - pad ||
      x > poly.maxX + pad ||
      y < poly.minY - pad ||
      y > poly.maxY + pad
    ) {
      continue;
    }
    const d = distanceToRingsDeg(poly.rings, x, y, index.scale, cosLat);
    if (d < bestDist) {
      bestDist = d;
      bestCode = poly.code;
    }
  }

  return bestCode;
}

export interface CountryFix {
  /** ISO alpha-2, or null when no single country can be named. */
  country: string | null;
  /** True when the accuracy circle reaches a different country. */
  borderRisk: boolean;
  /** True when the point sits in disputed/overlapping territory. */
  ambiguous: boolean;
  /** True when the point was in no polygon and snapped to a nearby shore. */
  snapped: boolean;
}

/** Accuracy above this is not a usable position (a city-wide Wi-Fi/IP guess). */
export const MAX_USABLE_ACCURACY_M = 100_000;
/**
 * Positional error budget of the bundled boundaries. Natural Earth 1:50m
 * generalises borders: the benchmark measured a real border displacement of
 * ~1.4 km (Rio Grande at Brownsville/Matamoros) and ~1 km (Gorizia/Nova
 * Gorica), on top of ~400 m source quantisation. The budget is ADDED to the
 * GPS accuracy radius when checking for a nearby border, so a fix within
 * ~2 km of any border is never reported as "clearly inside" a country, even
 * when the GPS itself is perfect. Such fixes are flagged `borderRisk` and the
 * server then leaves the country for the Owner to confirm.
 */
export const DATASET_POSITIONAL_ERROR_M = 2000;
/** Max distance a shore/pier fix may be snapped to the nearest country. */
export const SNAP_DISTANCE_M = 10_000;

const SAMPLE_BEARINGS = 16;
const SAMPLE_RADII = [1, 0.5];

/**
 * Resolves the country for a GPS fix.
 *
 * borderRisk: the fix is "confirmed" for a country only when the whole
 * accuracy circle lies inside it. The circle is sampled on 16 bearings at the
 * full and half radius; if any sample falls inside a DIFFERENT country the
 * result is flagged and the server will not treat it as a confirmed country.
 * A circle that only reaches the sea (coast) is NOT a border risk.
 */
export function resolveCountryFix(
  index: BoundaryIndex,
  lat: number,
  lon: number,
  accuracyM: number,
): CountryFix {
  const none: CountryFix = {
    country: null,
    borderRisk: false,
    ambiguous: false,
    snapped: false,
  };

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return none;
  }

  if (!Number.isFinite(accuracyM) || accuracyM > MAX_USABLE_ACCURACY_M) {
    return none;
  }

  const here = countriesAt(index, lon, lat);

  if (here.length > 1) {
    return { ...none, ambiguous: true, borderRisk: true };
  }

  let country: string | null = here[0] ?? null;
  let snapped = false;

  if (!country) {
    country = nearestCountryWithin(index, lon, lat, SNAP_DISTANCE_M);
    snapped = country !== null;
  }

  if (!country) return none;

  let borderRisk = false;
  const radius = Math.max(accuracyM, 0) + DATASET_POSITIONAL_ERROR_M;

  {
    outer: for (const factor of SAMPLE_RADII) {
      for (let i = 0; i < SAMPLE_BEARINGS; i++) {
        const p = offsetPoint(
          lat,
          lon,
          radius * factor,
          (2 * Math.PI * i) / SAMPLE_BEARINGS,
        );
        const there = countriesAt(index, p.lon, p.lat);
        if (there.some((c) => c !== country)) {
          borderRisk = true;
          break outer;
        }
      }
    }
  }

  return { country, borderRisk, ambiguous: false, snapped };
}
