import { countryFromCoordinates } from "./countryFromCoordinates";

export type GeolocationFailure =
  "unsupported" | "denied" | "unavailable" | "timeout" | "unusable";

export interface GeoHint {
  /** ISO alpha-2 country resolved locally. */
  country: string;
  /** Reported accuracy radius in metres (rounded). */
  accuracyM: number;
  /** The accuracy circle reaches another country. */
  borderRisk: boolean;
}

export type GeolocationResult =
  { ok: true; hint: GeoHint } | { ok: false; reason: GeolocationFailure };

export const GEOLOCATION_TIMEOUT_MS = 15_000;

/**
 * One-shot, high-accuracy position request. Rules:
 *  - ONLY ever called from an explicit user action (button / checkbox);
 *  - `getCurrentPosition`, never `watchPosition` (no tracking);
 *  - `maximumAge: 0` so a stale cached fix is never reused;
 *  - the coordinates stay inside this function: only the resolved country
 *    code, the accuracy radius and the border flag are returned.
 */
export function requestPreciseLocation(
  geo:
    Pick<Geolocation, "getCurrentPosition"> | undefined = typeof navigator !==
  "undefined"
    ? navigator.geolocation
    : undefined,
  timeoutMs: number = GEOLOCATION_TIMEOUT_MS,
): Promise<GeolocationResult> {
  if (!geo) return Promise.resolve({ ok: false, reason: "unsupported" });

  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        countryFromCoordinates(latitude, longitude, accuracy)
          .then((fix) => {
            if (!fix.country || fix.ambiguous) {
              resolve({ ok: false, reason: "unusable" });
              return;
            }
            resolve({
              ok: true,
              hint: {
                country: fix.country,
                accuracyM: Math.round(accuracy),
                borderRisk: fix.borderRisk,
              },
            });
          })
          .catch(() => resolve({ ok: false, reason: "unusable" }));
      },
      (error) => {
        resolve({
          ok: false,
          reason:
            error.code === error.PERMISSION_DENIED
              ? "denied"
              : error.code === error.TIMEOUT
                ? "timeout"
                : "unavailable",
        });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    );
  });
}
