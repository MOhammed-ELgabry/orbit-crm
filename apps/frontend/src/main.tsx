// Must be the very first import in this file — see instrument.ts for why.
import "./instrument";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import posthog from "posthog-js";
import { PostHogProvider } from "@posthog/react";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { initPostHog } from "./lib/posthog";
import ErrorFallback from "./Components/shared/ErrorFallback";

// Must run before anything renders — posthog-js's own init() is what
// PostHogProvider's `client` prop below relies on having already run.
initPostHog();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <PostHogProvider client={posthog}>
        <App />
      </PostHogProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
