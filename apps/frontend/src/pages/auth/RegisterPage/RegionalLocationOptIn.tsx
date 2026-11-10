import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LuMapPin } from "react-icons/lu";

import {
  requestPreciseLocation,
  type GeolocationFailure,
} from "../../../lib/regional/geolocation";
import { setGeoHint, useGeoHint } from "../../../lib/regional/geoStore";

const failureKey: Record<GeolocationFailure, string> = {
  denied: "regionalLocationDenied",
  unavailable: "regionalLocationUnavailable",
  timeout: "regionalLocationTimeout",
  unusable: "regionalLocationUnusable",
  unsupported: "regionalLocationUnsupported",
};

function countryName(code: string, language: string): string {
  try {
    return (
      new Intl.DisplayNames([language], { type: "region" }).of(code) ?? code
    );
  } catch {
    return code;
  }
}

/**
 * Optional, explained and strictly user-triggered. It never asks for the
 * location by itself, never blocks registration, and keeps only the resolved
 * country code (no coordinates) in memory.
 */
export default function RegionalLocationOptIn() {
  const { t, i18n } = useTranslation();
  const geo = useGeoHint();
  const [isLocating, setIsLocating] = useState(false);
  const [failure, setFailure] = useState<GeolocationFailure | null>(null);

  const handleClick = async () => {
    if (isLocating) return;
    setIsLocating(true);
    setFailure(null);

    const result = await requestPreciseLocation();

    if (result.ok) {
      setGeoHint(result.hint);
    } else {
      setGeoHint(null);
      setFailure(result.reason);
    }
    setIsLocating(false);
  };

  return (
    <section
      aria-labelledby="regional-location-title"
      className="mb-3 w-full rounded-[10px] bg-surface-muted px-3 py-2.5 text-start"
    >
      <p
        id="regional-location-title"
        className="text-xs font-semibold text-gray-700"
      >
        {t("regionalLocationTitle")}
      </p>
      <p className="mt-0.5 text-xs text-gray-500">
        {t("regionalLocationHint")}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {geo ? (
          <>
            <span
              role="status"
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"
            >
              <LuMapPin aria-hidden="true" />
              {t("regionalLocationDetected", {
                country: countryName(geo.country, i18n.language),
              })}
            </span>
            <button
              type="button"
              onClick={() => setGeoHint(null)}
              className="text-xs text-gray-500 underline hover:text-gray-700"
            >
              {t("regionalLocationClear")}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleClick}
            disabled={isLocating}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-surface-sunken disabled:opacity-60"
          >
            <LuMapPin aria-hidden="true" />
            {isLocating
              ? t("regionalLocationChecking")
              : t("regionalLocationButton")}
          </button>
        )}
      </div>

      {geo?.borderRisk && (
        <p className="mt-1.5 text-xs text-amber-600">
          {t("regionalLocationBorder")}
        </p>
      )}
      {failure && (
        <p role="status" className="mt-1.5 text-xs text-amber-600">
          {t(failureKey[failure])}
        </p>
      )}
    </section>
  );
}
