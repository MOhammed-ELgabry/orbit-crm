import {
  buildBoundaryIndex,
  resolveCountryFix,
  type BoundaryDataset,
  type BoundaryIndex,
  type CountryFix,
} from "./geometry";

let indexPromise: Promise<BoundaryIndex> | null = null;

/**
 * The boundary dataset (~0.5 MB gzipped) is a separate chunk that is only
 * downloaded when the user actually allows location access.
 */
function loadIndex(): Promise<BoundaryIndex> {
  if (!indexPromise) {
    indexPromise = import("./data/countryBoundaries.json").then((m) =>
      buildBoundaryIndex((m.default ?? m) as unknown as BoundaryDataset),
    );
    // A failed chunk load must be retryable.
    indexPromise.catch(() => {
      indexPromise = null;
    });
  }
  return indexPromise;
}

/**
 * Country of a coordinate, computed ENTIRELY in the browser. The coordinates
 * are used for this one call and are neither stored nor sent anywhere; only
 * the resulting country code (and accuracy/border flag) can leave the device.
 */
export async function countryFromCoordinates(
  lat: number,
  lon: number,
  accuracyM: number,
): Promise<CountryFix> {
  return resolveCountryFix(await loadIndex(), lat, lon, accuracyM);
}

/** Test hook. */
export function resetBoundaryCache(): void {
  indexPromise = null;
}
