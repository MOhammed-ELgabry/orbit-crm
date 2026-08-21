export default () => ({
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    isProduction: process.env.NODE_ENV === 'production',
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,

    accessExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN,

    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN,
  },

  // Cookie policy for the auth architecture. See
  // modules/auth/utils/cookie-options.util.ts for how these are applied —
  // this section is just the environment-driven inputs.
  cookies: {
    // No default: cookies are scoped to the exact host that set them
    // unless a shared parent domain is explicitly configured.
    domain: process.env.COOKIE_DOMAIN,
  },

  // Required (see env.validation.ts) — the single source of truth for the
  // CORS allow-list and the OAuth popup's postMessage targetOrigin.
  frontendUrl: process.env.FRONTEND_URL,

  // All fields below (except frontendUrl, kept here too for existing call
  // sites) are optional at boot time (see env.validation.ts) so that
  // existing deployments without Social Authentication configured
  // continue to start exactly as before. Each provider checks its own
  // configuration at request time and fails with a clear 503 if unset,
  // rather than the app failing to boot.
  socialAuth: {
    stateSecret: process.env.SOCIAL_AUTH_STATE_SECRET,

    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackUrl: process.env.GOOGLE_CALLBACK_URL,
    },

    facebook: {
      appId: process.env.FACEBOOK_APP_ID,
      appSecret: process.env.FACEBOOK_APP_SECRET,
      callbackUrl: process.env.FACEBOOK_CALLBACK_URL,
    },

    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      tenantId: process.env.MICROSOFT_TENANT_ID,
      callbackUrl: process.env.MICROSOFT_CALLBACK_URL,
    },
  },
});
