// Imported as the literal first line of main.tsx, before React or any
// other app code — see that file. Nothing else should import from
// this file.
import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,

    // Error monitoring only — no performance tracing (that's a
    // separate, higher-volume feature this task didn't ask for) and
    // deliberately no Session Replay: this app renders real CRM
    // contact data (names, emails, phone numbers, notes) on screen,
    // and replay is a visual session recording, a materially
    // different and riskier product than error monitoring.
    tracesSampleRate: 0,

    // Most Sentry examples set this true for convenience (it also
    // enables automatic IP address collection). Overridden here given
    // this app's data — CRM contact and account information — calls
    // for the more conservative default.
    sendDefaultPii: false,

    // Defense in depth beyond sendDefaultPii: false. Nothing in this
    // app should ever hand Sentry a cookie or Authorization header,
    // but if a future integration (or a future SDK default) ever
    // attached one, strip it here rather than trust that upstream to
    // have already scrubbed it.
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers["Cookie"];
        delete event.request.headers["cookie"];
        delete event.request.headers["Authorization"];
        delete event.request.headers["authorization"];
      }
      if (event.request) {
        delete event.request.cookies;
      }
      return event;
    },
  });
} else {
  // No DSN configured (e.g. local development) — the app should run
  // exactly as it did before Sentry existed, not fail or spam the
  // console on every load.
  console.warn(
    "Sentry is not configured (VITE_SENTRY_DSN is unset) — error monitoring is disabled.",
  );
}
