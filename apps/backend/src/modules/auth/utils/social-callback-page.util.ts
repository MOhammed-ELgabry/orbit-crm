export const SOCIAL_AUTH_SUCCESS_MESSAGE = 'orbit-social-auth-success';
export const SOCIAL_AUTH_ERROR_MESSAGE = 'orbit-social-auth-error';

/**
 * Renders the minimal HTML page served by the OAuth callback endpoint,
 * inside the popup. It posts the result to the opener (main window) and
 * closes itself.
 *
 * Security notes:
 * - `targetOrigin` is passed to `postMessage` explicitly (never '*'), so
 *   the browser only delivers the message if the opener's current origin
 *   still matches the configured frontend origin.
 * - The JSON payload is embedded via `JSON.stringify` and then has every
 *   `<` replaced with its unicode escape, which prevents a provider-
 *   supplied string (e.g. a name containing "</script>") from breaking out
 *   of the inline <script> tag.
 * - No token, code, or secret is ever put in a URL — everything travels
 *   only via postMessage, in the response body.
 */
export function renderSocialAuthCallbackPage(
  targetOrigin: string,
  message: { type: string; payload: unknown },
): string {
  const safeOrigin = JSON.stringify(targetOrigin).replace(/</g, '\\u003c');
  const safeMessage = JSON.stringify(message).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /><title>Signing you in…</title></head>
  <body>
    <p>Signing you in, this window will close automatically…</p>
    <script>
      (function () {
        try {
          if (window.opener) {
            window.opener.postMessage(${safeMessage}, ${safeOrigin});
          }
        } finally {
          window.close();
        }
      })();
    </script>
  </body>
</html>`;
}