// Fallback UI for Sentry.ErrorBoundary (see main.tsx). Kept
// intentionally plain (not run through i18n) — this is an emergency
// screen shown only when a component crashes, not part of the app's
// normal UI surface.
export default function ErrorFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
        <h1 className="font-nunito text-lg font-semibold text-ink">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          This has been reported. Try reloading the page.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 h-[38px] w-full rounded-[10px] bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
