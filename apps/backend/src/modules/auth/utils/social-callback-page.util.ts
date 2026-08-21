export const SOCIAL_AUTH_SUCCESS_MESSAGE = 'orbit-social-auth-success';

export const SOCIAL_AUTH_ERROR_MESSAGE = 'orbit-social-auth-error';

/**
 * Renders the HTML page returned by the OAuth callback.
 *
 * The callback page runs inside the authentication popup
 * and sends the authentication result to the original
 * frontend window using postMessage.
 *
 * Authentication flow:
 *
 * OAuth Provider
 *      ↓
 * Backend callback
 *      ↓
 * Callback HTML
 *      ↓
 * window.opener.postMessage()
 *      ↓
 * Frontend application
 *
 * Security:
 * - targetOrigin is explicit.
 * - "*" is never used.
 * - Payload is JSON encoded.
 * - "<" is escaped before embedding into the script.
 * - Tokens are never placed inside the URL.
 *
 * Important:
 * window.close() is best-effort only.
 * Authentication success does not depend on the
 * popup being successfully closed.
 */
export function renderSocialAuthCallbackPage(
  targetOrigin: string,
  message: {
    type: string;
    payload: unknown;
  },
): string {
  /**
   * Escape "<" to prevent a malicious provider-supplied
   * value from breaking out of the inline script.
   */
  const safeOrigin = JSON.stringify(targetOrigin).replace(/</g, '\\u003c');

  const safeMessage = JSON.stringify(message).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />

    <meta
      name="viewport"
      content="width=device-width, initial-scale=1"
    />

    <meta
      name="robots"
      content="noindex, nofollow"
    />

    <title>Signing you in…</title>

    <style>
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
      }

      body {
        display: flex;
        align-items: center;
        justify-content: center;

        background: #ffffff;

        font-family:
          Inter,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;

        text-align: center;
      }

      .container {
        padding: 32px;
      }

      .spinner {
        width: 42px;
        height: 42px;

        margin: 0 auto 20px;

        border: 4px solid #eeeef5;
        border-top-color: #605bff;

        border-radius: 50%;

        animation:
          orbit-spin 0.8s linear infinite;
      }

      h1 {
        margin: 0 0 8px;

        color: #030229;

        font-size: 20px;
        font-weight: 600;
      }

      p {
        margin: 0;

        color: #6b6b7a;

        font-size: 14px;
      }

      @keyframes orbit-spin {
        to {
          transform: rotate(360deg);
        }
      }
    </style>
  </head>

  <body>
    <main class="container">
      <div
        class="spinner"
        aria-hidden="true"
      ></div>

      <h1>Signing you in…</h1>

      <p>
        Please wait while we complete authentication.
      </p>
    </main>

    <script>
      (function () {
        try {
          /**
           * Send the authentication result to the
           * original frontend window.
           *
           * targetOrigin is explicitly controlled
           * by the backend.
           */
          if (window.opener) {
            window.opener.postMessage(
              ${safeMessage},
              ${safeOrigin}
            );
          }
        } catch (error) {
          /**
           * Do not expose authentication data or
           * internal errors to the page.
           *
           * The frontend handles timeout/error behavior.
           */
          console.error(
            "Social authentication callback error.",
            error
          );
        } finally {
          /**
           * Closing the popup is best-effort.
           *
           * Chrome may prevent window.close() because
           * of Cross-Origin-Opener-Policy.
           *
           * Authentication success does NOT depend
           * on this operation.
           */
          try {
            window.close();
          } catch {
            // Ignore browser restrictions.
          }
        }
      })();
    </script>
  </body>
</html>`;
}
