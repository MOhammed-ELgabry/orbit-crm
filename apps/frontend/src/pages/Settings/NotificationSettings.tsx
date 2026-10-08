import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  disablePush,
  enablePush,
  getCurrentPushSubscription,
  getPushPermission,
  isPushSupported,
  PushError,
} from "../../lib/push";
import { trackEvent } from "../../lib/posthog";
import {
  getNotificationPreferences,
  updateNotificationPreference,
} from "../../services/notificationService";
import type {
  NotificationChannel,
  NotificationPreferences,
} from "../../types/notification";

type Problem =
  | "load"
  | "save"
  | "denied"
  | "unsupported"
  | "not_configured"
  | "push_failed"
  | null;

function Switch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-[#605BFF]" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? "start-[22px]" : "start-0.5"
        }`}
      />
    </button>
  );
}

/**
 * Settings → Notifications. Internal (in-app) notifications are always
 * on and therefore have no switch. The preference calls carry only the
 * channel and the new value: whose preference it is comes from the
 * authenticated session on the server, never from this component.
 */
export default function NotificationSettings() {
  const { t } = useTranslation();

  const [preferences, setPreferences] =
    useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const [deviceEnabled, setDeviceEnabled] = useState(false);

  const supported = isPushSupported();
  const permission = getPushPermission();

  const load = useCallback(async () => {
    // async-first so the effect below does not set state synchronously
    // (react-hooks/set-state-in-effect).
    await Promise.resolve();
    setIsLoading(true);
    setProblem(null);

    try {
      setPreferences(await getNotificationPreferences());
    } catch {
      setProblem("load");
    } finally {
      setIsLoading(false);
    }

    // Look only (never prompt): is THIS browser already subscribed?
    try {
      setDeviceEnabled((await getCurrentPushSubscription()) !== null);
    } catch {
      setDeviceEnabled(false);
    }
  }, []);

  // A local function called from the effect (repo convention — see
  // ActivityTimeline) rather than the hoisted `load` reference.
  useEffect(() => {
    const loadOnMount = async () => {
      await load();
    };
    void loadOnMount();
  }, [load]);

  const toggleChannel = async (
    channel: NotificationChannel,
    enabled: boolean,
  ) => {
    if (busy || !preferences) return;

    setBusy(true);
    setProblem(null);

    try {
      setPreferences(await updateNotificationPreference(channel, enabled));
      trackEvent("notification_preference_changed", { channel, enabled });
    } catch {
      setProblem("save");
    } finally {
      setBusy(false);
    }
  };

  const handleEnableDevice = async () => {
    if (busy) return;

    setBusy(true);
    setProblem(null);

    try {
      await enablePush();
      setDeviceEnabled(true);
      setPreferences(await getNotificationPreferences());
    } catch (error) {
      if (error instanceof PushError) {
        setProblem(
          error.reason === "denied"
            ? "denied"
            : error.reason === "unsupported"
              ? "unsupported"
              : error.reason === "not_configured"
                ? "not_configured"
                : "push_failed",
        );
      } else {
        setProblem("push_failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDisableDevice = async () => {
    if (busy) return;

    setBusy(true);
    setProblem(null);

    try {
      await disablePush();
      setDeviceEnabled(false);
      setPreferences(await getNotificationPreferences());
    } catch {
      setProblem("push_failed");
    } finally {
      setBusy(false);
    }
  };

  const pushUnavailableReason = !supported
    ? t("pushUnsupported")
    : permission === "denied"
      ? t("pushPermissionDenied")
      : preferences && !preferences.pushAvailable
        ? t("pushNotConfigured")
        : null;

  const problemText: Record<Exclude<Problem, null>, string> = {
    load: t("notificationsSettingsLoadError"),
    save: t("notificationsSettingsSaveError"),
    denied: t("pushPermissionDenied"),
    unsupported: t("pushUnsupported"),
    not_configured: t("pushNotConfigured"),
    push_failed: t("pushFailed"),
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 sm:p-6">
      <h2 className="font-nunito text-base font-semibold text-slate-800">
        {t("notificationSettingsTitle")}
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        {t("notificationSettingsDescription")}
      </p>

      {isLoading && !preferences ? (
        <p role="status" className="mt-4 text-sm text-slate-500">
          {t("notificationsLoading")}
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {problem && (
            <p role="alert" className="text-xs font-medium text-rose-600">
              {problemText[problem]}
              {problem === "load" && (
                <button
                  type="button"
                  onClick={() => void load()}
                  className="ms-2 underline"
                >
                  {t("notificationsRetry")}
                </button>
              )}
            </p>
          )}

          {preferences && (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {t("notificationsInAppLabel")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t("notificationsInAppAlwaysOn")}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {t("emailNotificationsLabel")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {preferences.emailAvailable
                      ? t("emailNotificationsDescription")
                      : t("emailNotificationsUnavailable")}
                  </p>
                </div>

                <Switch
                  checked={preferences.email}
                  disabled={busy || !preferences.emailAvailable}
                  label={t("emailNotificationsLabel")}
                  onChange={(next) => void toggleChannel("email", next)}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {t("pushNotificationsLabel")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t("pushNotificationsDescription")}
                  </p>
                </div>

                <Switch
                  checked={preferences.push}
                  disabled={busy || !preferences.pushAvailable}
                  label={t("pushNotificationsLabel")}
                  onChange={(next) => void toggleChannel("push", next)}
                />
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-800">
                  {t("pushThisDeviceLabel")}
                </p>

                {pushUnavailableReason ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {pushUnavailableReason}
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-xs text-slate-500">
                      {deviceEnabled
                        ? t("pushThisDeviceEnabled")
                        : t("pushThisDeviceDisabled")}
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        void (deviceEnabled
                          ? handleDisableDevice()
                          : handleEnableDevice())
                      }
                      disabled={busy}
                      className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {deviceEnabled
                        ? t("pushDisableThisDevice")
                        : t("pushEnableThisDevice")}
                    </button>
                  </>
                )}

                <p className="mt-2 text-[11px] text-slate-400">
                  {t("pushRegisteredDevices", {
                    count: preferences.devices.length,
                  })}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}