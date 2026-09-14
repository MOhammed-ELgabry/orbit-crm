import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// Build-machine-only secret for uploading source maps so production
// stack traces are readable in Sentry. Never a VITE_-prefixed var —
// that would inline it into the shipped client bundle — and never
// read from .env.example, which only lists client-exposed VITE_ vars.
// Set only in CI/build environments that actually have a Sentry
// project configured.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Only added when a build machine actually has SENTRY_AUTH_TOKEN
    // set, so a build with nothing Sentry-related configured (every
    // developer's local machine, or CI before this is set up) behaves
    // exactly as it did before this plugin existed.
    ...(sentryAuthToken
      ? sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: sentryAuthToken,
          sourcemaps: {
            // Uploaded to Sentry for symbolication, then removed from
            // the output directory so they're never shipped to/served
            // from production alongside the app.
            filesToDeleteAfterUpload: ["./dist/**/*.map"],
          },
        })
      : []),
  ],
  build: {
    // Only generated when the plugin above is actually going to
    // upload-and-delete them — a build with no SENTRY_AUTH_TOKEN
    // configured never starts shipping public .map files it didn't
    // generate before.
    sourcemap: Boolean(sentryAuthToken),
  },
});