import { useSyncExternalStore } from "react";
import type { GeoHint } from "./geolocation";

/**
 * In-memory only. The consented geolocation result (country code, accuracy
 * radius, border flag — never coordinates) lives here until the user
 * registers or leaves the page. It is deliberately NOT persisted to
 * localStorage/sessionStorage/cookies.
 */
let current: GeoHint | null = null;
const listeners = new Set<() => void>();

export const getGeoHint = (): GeoHint | null => current;

export function setGeoHint(hint: GeoHint | null): void {
  current = hint;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useGeoHint(): GeoHint | null {
  return useSyncExternalStore(subscribe, getGeoHint, getGeoHint);
}
