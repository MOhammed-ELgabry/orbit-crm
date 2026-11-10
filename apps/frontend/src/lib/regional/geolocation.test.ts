import { describe, expect, it, vi } from "vitest";

import { requestPreciseLocation } from "./geolocation";
import { collectPassiveSignals } from "./signals";
import { buildRegionalHints, hasAnyHint } from "./hints";

type Ok = (p: { coords: GeolocationCoordinates }) => void;
type Err = (e: GeolocationPositionError) => void;

const fakeGeo = (
  run: (ok: Ok, err: Err, options: PositionOptions) => void,
) => ({
  getCurrentPosition: vi.fn(
    (
      ok: PositionCallback,
      err?: PositionErrorCallback | null,
      o?: PositionOptions,
    ) => run(ok as unknown as Ok, err as unknown as Err, o as PositionOptions),
  ),
});

const error = (code: number) =>
  ({
    code,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  }) as GeolocationPositionError;

describe("requestPreciseLocation", () => {
  it("resolves a country and returns no coordinates", async () => {
    const geo = fakeGeo((ok) =>
      ok({
        coords: {
          latitude: 30.0444,
          longitude: 31.2357,
          accuracy: 25,
        } as GeolocationCoordinates,
      }),
    );

    const result = await requestPreciseLocation(geo, 5000);

    expect(result).toEqual({
      ok: true,
      hint: { country: "EG", accuracyM: 25, borderRisk: false },
    });
    expect(JSON.stringify(result)).not.toContain("30.04");
  });

  it("is one-shot, high accuracy and never reuses a cached fix", async () => {
    const geo = fakeGeo((ok) =>
      ok({
        coords: {
          latitude: 30.0444,
          longitude: 31.2357,
          accuracy: 25,
        } as GeolocationCoordinates,
      }),
    );
    await requestPreciseLocation(geo, 7000);

    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(geo.getCurrentPosition.mock.calls[0][2]).toEqual({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 7000,
    });
  });

  it("flags a fix whose accuracy circle reaches another country", async () => {
    // Monaco: a 20 m fix is still inside the border error budget of France/Italy.
    const geo = fakeGeo((ok) =>
      ok({
        coords: {
          latitude: 43.7384,
          longitude: 7.4246,
          accuracy: 20,
        } as GeolocationCoordinates,
      }),
    );

    const result = await requestPreciseLocation(geo, 5000);

    expect(result.ok && result.hint.borderRisk).toBe(true);
  });

  it.each([
    [1, "denied"],
    [2, "unavailable"],
    [3, "timeout"],
  ])("maps error code %i to %s", async (code, reason) => {
    const geo = fakeGeo((_ok, err) => err(error(code)));

    expect(await requestPreciseLocation(geo, 5000)).toEqual({
      ok: false,
      reason,
    });
  });

  it("is unusable when accuracy is hopeless", async () => {
    const geo = fakeGeo((ok) =>
      ok({
        coords: {
          latitude: 30.0444,
          longitude: 31.2357,
          accuracy: 500_000,
        } as GeolocationCoordinates,
      }),
    );

    expect(await requestPreciseLocation(geo, 5000)).toEqual({
      ok: false,
      reason: "unusable",
    });
  });

  it("reports unsupported when the browser has no geolocation", async () => {
    expect(await requestPreciseLocation(undefined, 5000)).toEqual({
      ok: false,
      reason: "unsupported",
    });
  });
});

describe("passive signals and hints", () => {
  it("reads an IANA timezone and languages without any permission", () => {
    const signals = collectPassiveSignals();

    expect(signals.timezone).toMatch(/^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/);
    expect(signals.locales?.length ?? 0).toBeGreaterThan(0);
  });

  it("attaches geo only when the user allowed it", () => {
    expect(buildRegionalHints().geo).toBeUndefined();
    expect(buildRegionalHints(null).geo).toBeUndefined();
    expect(
      buildRegionalHints({ country: "EG", accuracyM: 10, borderRisk: false })
        .geo,
    ).toEqual({ country: "EG", accuracyM: 10, borderRisk: false });
  });

  it("hasAnyHint is false for an empty payload", () => {
    expect(hasAnyHint({})).toBe(false);
    expect(hasAnyHint({ timezone: "Africa/Cairo" })).toBe(true);
  });
});
