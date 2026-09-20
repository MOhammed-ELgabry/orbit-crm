// Sentry's own instrumentation (OpenTelemetry-based) needs to patch
// Node's http module, the database driver, etc. before anything else
// in this app requires them — so this file exists only to be imported
// as the literal first line of main.ts, before NestFactory or any
// application module. Nothing else should import from this file.
import * as Sentry from '@sentry/nestjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',

    // Error monitoring only — no performance tracing. This can be
    // raised as a separate, explicit change later; it isn't part of
    // what was asked for here, and turning it on means auditing
    // tracePropagationTargets and sampling separately.
    tracesSampleRate: 0,

    // Sentry's own default for this is already false, but that default
    // is easy to miss and easy for a future dependency bump to change
    // silently — pinning it explicitly here means "don't collect IP
    // addresses or other default PII" is a decision this file states,
    // not one this file merely inherits.
    sendDefaultPii: false,

    // Defense in depth beyond sendDefaultPii: false. Nothing in this
    // app should ever hand Sentry a Cookie or Authorization header,
    // but if some future integration (or a future Sentry SDK default)
    // ever attached one to an event's request context, strip it here
    // rather than trust that upstream to have already scrubbed it.
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers['cookie'];
        delete event.request.headers['Cookie'];
        delete event.request.headers['authorization'];
        delete event.request.headers['Authorization'];
      }
      if (event.request) {
        delete event.request.cookies;
      }
      return event;
    },
  });
} else {
  // No DSN configured (e.g. local development) — the app should run
  // exactly as it did before Sentry existed, not fail to boot or spam
  // the console on every request.
  console.warn(
    'Sentry is not configured (SENTRY_DSN is unset) — error monitoring is disabled.',
  );
}
