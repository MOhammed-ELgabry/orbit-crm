import {
  getPushPublicKey,
  subscribePush,
  unsubscribePush,
} from "../services/notificationService";
import { trackEvent } from "./posthog";

/**
 * Web Push client helpers (browser side of notifications). Push only —
 * the service worker (public/sw.js) has no fetch handler and caches
 * nothing; this is deliberately not a PWA.
 *
 * The browser permission prompt is ONLY ever triggered from
 * enablePush(), which callers must invoke from an explicit user action
 * (a button click) — never on page load, never from an effect.
 */

export const SERVICE_WORKER_URL = "/sw.js";

export type PushFailureReason =
  "unsupported" | "denied" | "not_configured" | "failed";

export class PushError extends Error {
  readonly reason: PushFailureReason;

  constructor(reason: PushFailureReason) {
    super(`push_${reason}`);
    this.name = "PushError";
    this.reason = reason;
  }
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getPushPermission(): NotificationPermission | "unsupported" {
  return isPushSupported() ? Notification.permission : "unsupported";
}

/** VAPID public key (base64url) -> the byte array pushManager wants. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);

  return bytes;
}

/**
 * The subscription of THIS browser, if any. Never registers the worker
 * and never prompts: it only looks.
 */
export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  const registration =
    await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);

  return registration ? registration.pushManager.getSubscription() : null;
}

function toPayload(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const keys = json.keys;

  if (!json.endpoint || !keys?.p256dh || !keys.auth) {
    throw new PushError("failed");
  }

  return {
    endpoint: json.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    userAgent: navigator.userAgent.slice(0, 255),
  };
}

/**
 * Asks for permission (user gesture required), registers the worker,
 * subscribes this browser and hands the subscription to the backend.
 */
export async function enablePush(): Promise<void> {
  if (!isPushSupported()) throw new PushError("unsupported");

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

  if (permission !== "granted") {
    trackEvent("notification_push_blocked");
    throw new PushError("denied");
  }

  let publicKey: string;
  try {
    publicKey = await getPushPublicKey();
  } catch {
    // 503: push is not configured on this deployment.
    throw new PushError("not_configured");
  }

  const registration =
    await navigator.serviceWorker.register(SERVICE_WORKER_URL);
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  await subscribePush(toPayload(subscription));
  trackEvent("notification_push_enabled");
}

/** Removes this browser's subscription locally and on the server. */
export async function disablePush(): Promise<void> {
  const subscription = await getCurrentPushSubscription();

  if (subscription) {
    const { endpoint } = subscription;

    // Server first: if the browser-side unsubscribe fails afterwards the
    // device is already off the server and can never be pushed to.
    await unsubscribePush(endpoint);
    await subscription.unsubscribe();
  }

  trackEvent("notification_push_disabled");
}

/**
 * Best-effort cleanup used by logout (while the session cookie still
 * exists): detach this device from the account that is signing out so a
 * shared computer never keeps receiving that user's pushes. Never throws.
 */
export async function detachPushOnLogout(): Promise<void> {
  try {
    const subscription = await getCurrentPushSubscription();
    if (!subscription) return;

    await unsubscribePush(subscription.endpoint);
    await subscription.unsubscribe();
  } catch {
    // Logging out must never be blocked by push cleanup. The server also
    // stops pushing to users without an active session.
  }
}