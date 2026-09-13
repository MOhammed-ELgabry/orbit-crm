import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import posthog from "posthog-js";
import { PostHogProvider } from "@posthog/react";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { initPostHog } from "./lib/posthog";

// Must run before anything renders — posthog-js's own init() is what
// PostHogProvider's `client` prop below relies on having already run.
initPostHog();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PostHogProvider client={posthog}>
      <App />
    </PostHogProvider>
  </StrictMode>,
);