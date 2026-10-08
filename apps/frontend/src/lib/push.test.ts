import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  getPushPublicKey: vi.fn(),
  subscribePush: vi.fn(),
  unsubscribePush: vi.fn(),
}));
const track = vi.hoisted(() => vi.fn());

vi.mock("../services/notificationService", () => service);
vi.mock("./posthog", () => ({ trackEvent: track }));

import {
  detachPushOnLogout,
  disablePush,
  enablePush,
  getCurrentPushSubscription,
  getPushPermission,
  isPushSupported,
  PushError,
  SERVICE_WORKER_URL,
  urlBase64ToUint8Array,
} from "./push";

// A valid-looking VAPID key (base64url of 65 bytes starting with 0x04).
const VAPID = "BP" + "A".repeat(85);

function makeSubscription(endpoint = "https://push.example.com/send/abc") {
  return {
    endpoint,
    toJSON: () => ({
      endpoint,
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

interface Env {
  permission: NotificationPermission;
  requestPermission: ReturnType<typeof vi.fn>;
  register: ReturnType<typeof vi.fn>;
  getRegistration: ReturnType<typeof vi.fn>;
  pushManager: {
    getSubscription: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  };
}

function installPushEnv(
  options: Partial<{ permission: NotificationPermission }> = {},
) {
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn().mockResolvedValue(makeSubscription()),
  };
  const registration = { pushManager };

  const requestPermission = vi.fn().mockResolvedValue("granted");
  const NotificationStub = Object.assign(function () {}, {
    permission: options.permission ?? "default",
    requestPermission,
  });

  const register = vi.fn().mockResolvedValue(registration);
  const getRegistration = vi.fn().mockResolvedValue(registration);

  vi.stubGlobal("Notification", NotificationStub);
  vi.stubGlobal("PushManager", function () {});
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register, getRegistration, ready: Promise.resolve(registration) },
  });

  return {
    permission: NotificationStub.permission,
    requestPermission,
    register,
    getRegistration,
    pushManager,
  } as Env;
}

function removeServiceWorker() {
  Reflect.deleteProperty(navigator, "serviceWorker");
}

describe("push helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.getPushPublicKey.mockResolvedValue(VAPID);
    service.subscribePush.mockResolvedValue(undefined);
    service.unsubscribePush.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    removeServiceWorker();
  });

  describe("unsupported browser", () => {
    beforeEach(() => {
      removeServiceWorker();
      vi.stubGlobal("Notification", undefined);
      Reflect.deleteProperty(window, "Notification");
      Reflect.deleteProperty(window, "PushManager");
    });

    it("reports push as unsupported and never touches the network", async () => {
      expect(isPushSupported()).toBe(false);
      expect(getPushPermission()).toBe("unsupported");
      expect(await getCurrentPushSubscription()).toBeNull();

      await expect(enablePush()).rejects.toMatchObject({
        name: "PushError",
        reason: "unsupported",
      });
      expect(service.getPushPublicKey).not.toHaveBeenCalled();
      expect(service.subscribePush).not.toHaveBeenCalled();
    });

    it("detachPushOnLogout is a silent no-op", async () => {
      await expect(detachPushOnLogout()).resolves.toBeUndefined();
      expect(service.unsubscribePush).not.toHaveBeenCalled();
    });
  });

  describe("permission denied", () => {
    it("tracks the block, throws PushError(denied) and sends nothing", async () => {
      const env = installPushEnv();
      env.requestPermission.mockResolvedValue("denied");

      await expect(enablePush()).rejects.toMatchObject({ reason: "denied" });

      expect(env.requestPermission).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenCalledWith("notification_push_blocked");
      expect(env.register).not.toHaveBeenCalled();
      expect(service.subscribePush).not.toHaveBeenCalled();
    });

    it("does not prompt again when the permission is already blocked", async () => {
      const env = installPushEnv({ permission: "denied" });
      env.requestPermission.mockResolvedValue("denied");

      await expect(enablePush()).rejects.toBeInstanceOf(PushError);
      expect(getPushPermission()).toBe("denied");
    });
  });

  describe("successful subscription", () => {
    it("permission -> service worker -> PushSubscription -> POST subscribe", async () => {
      const env = installPushEnv();

      await enablePush();

      expect(env.requestPermission).toHaveBeenCalledTimes(1);
      expect(service.getPushPublicKey).toHaveBeenCalledTimes(1);
      expect(env.register).toHaveBeenCalledWith(SERVICE_WORKER_URL);

      const subscribeArgs = env.pushManager.subscribe.mock.calls[0][0];
      expect(subscribeArgs.userVisibleOnly).toBe(true);
      expect(subscribeArgs.applicationServerKey).toBeInstanceOf(Uint8Array);

      expect(service.subscribePush).toHaveBeenCalledTimes(1);
      const payload = service.subscribePush.mock.calls[0][0];
      expect(payload).toMatchObject({
        endpoint: "https://push.example.com/send/abc",
        keys: { p256dh: "p256dh-key", auth: "auth-key" },
      });
      // The client never supplies who owns the subscription.
      expect(payload).not.toHaveProperty("userId");
      expect(payload).not.toHaveProperty("companyId");

      expect(track).toHaveBeenCalledWith("notification_push_enabled");
    });

    it("does not prompt again when permission is already granted and reuses an existing subscription", async () => {
      const env = installPushEnv({ permission: "granted" });
      const existing = makeSubscription(
        "https://push.example.com/send/existing",
      );
      env.pushManager.getSubscription.mockResolvedValue(existing);

      await enablePush();

      expect(env.requestPermission).not.toHaveBeenCalled();
      expect(env.pushManager.subscribe).not.toHaveBeenCalled();
      expect(service.subscribePush.mock.calls[0][0].endpoint).toBe(
        "https://push.example.com/send/existing",
      );
    });

    it("maps a missing server key (push not configured) to not_configured", async () => {
      const env = installPushEnv({ permission: "granted" });
      service.getPushPublicKey.mockRejectedValue(new Error("503"));

      await expect(enablePush()).rejects.toMatchObject({
        reason: "not_configured",
      });
      expect(env.register).not.toHaveBeenCalled();
    });

    it("never persists subscription data in web storage", async () => {
      installPushEnv();
      const local = vi.spyOn(Storage.prototype, "setItem");

      await enablePush();

      expect(local).not.toHaveBeenCalled();
      local.mockRestore();
    });
  });

  describe("unsubscribe", () => {
    it("asks the server first, then unsubscribes the browser", async () => {
      const env = installPushEnv({ permission: "granted" });
      const current = makeSubscription();
      env.pushManager.getSubscription.mockResolvedValue(current);

      const order: string[] = [];
      service.unsubscribePush.mockImplementation(async () => {
        order.push("server");
      });
      current.unsubscribe.mockImplementation(async () => {
        order.push("browser");
        return true;
      });

      await disablePush();

      expect(service.unsubscribePush).toHaveBeenCalledWith(
        "https://push.example.com/send/abc",
      );
      expect(order).toEqual(["server", "browser"]);
      expect(track).toHaveBeenCalledWith("notification_push_disabled");
    });

    it("is a no-op for the browser when there is no subscription", async () => {
      installPushEnv({ permission: "granted" });

      await disablePush();

      expect(service.unsubscribePush).not.toHaveBeenCalled();
    });

    it("detachPushOnLogout never throws, even if the server call fails", async () => {
      const env = installPushEnv({ permission: "granted" });
      env.pushManager.getSubscription.mockResolvedValue(makeSubscription());
      service.unsubscribePush.mockRejectedValue(new Error("network down"));

      await expect(detachPushOnLogout()).resolves.toBeUndefined();
    });
  });

  describe("urlBase64ToUint8Array", () => {
    it("decodes base64url (with - and _) into bytes", () => {
      // 0xfb 0xff -> "-_8" in base64url
      expect(Array.from(urlBase64ToUint8Array("-_8"))).toEqual([0xfb, 0xff]);
    });
  });
});