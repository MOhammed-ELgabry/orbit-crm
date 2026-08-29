import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  PORT: Joi.number().required(),

  JWT_ACCESS_SECRET: Joi.string().required(),

  JWT_REFRESH_SECRET: Joi.string().required(),

  ACCESS_TOKEN_EXPIRES_IN: Joi.string().required(),

  REFRESH_TOKEN_EXPIRES_IN: Joi.string().required(),

  DATABASE_URL: Joi.string().required(),

  // Required: MailService reads these directly and register()/
  // resendVerification()/forgotPassword() all call it synchronously as
  // part of the request — with these unset or wrong, the failure doesn't
  // surface here at boot, it surfaces mid-registration as a generic 500
  // AFTER the user + verification rows are already committed, leaving an
  // account the user can never verify (a retry then fails with "already
  // exists"). Required so that misconfiguration is caught immediately
  // instead of during a live demo of the registration flow.
  MAIL_HOST: Joi.string().required(),
  MAIL_PORT: Joi.number().required(),
  MAIL_USER: Joi.string().required(),
  MAIL_PASSWORD: Joi.string().required(),
  MAIL_FROM: Joi.string().required(),

  // Required: this is now the single source of truth for both the CORS
  // allow-list and the OAuth popup's postMessage targetOrigin. Auth now
  // relies on cookies, so an unconfigured/wrong value here doesn't just
  // degrade social login — it silently breaks CORS + cookie delivery for
  // the whole app. Making it required surfaces that misconfiguration at
  // boot instead of in production traffic.
  FRONTEND_URL: Joi.string().uri().required(),

  // Optional: only needed if the API cookies must be shared across
  // subdomains (e.g. app.example.com + api.example.com both reading a
  // cookie scoped to .example.com). Leave unset to scope cookies to the
  // exact host that issued them — the safer default.
  COOKIE_DOMAIN: Joi.string().optional(),

  // Social Authentication — all OPTIONAL so existing deployments without
  // these configured keep booting exactly as before. When present, format
  // is validated; each provider is checked for completeness at request
  // time by its own provider service.

  SOCIAL_AUTH_STATE_SECRET: Joi.string().min(16).optional(),

  GOOGLE_CLIENT_ID: Joi.string().optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().optional(),
  GOOGLE_CALLBACK_URL: Joi.string().uri().optional(),

  FACEBOOK_APP_ID: Joi.string().optional(),
  FACEBOOK_APP_SECRET: Joi.string().optional(),
  FACEBOOK_CALLBACK_URL: Joi.string().uri().optional(),

  MICROSOFT_CLIENT_ID: Joi.string().optional(),
  MICROSOFT_CLIENT_SECRET: Joi.string().optional(),
  MICROSOFT_TENANT_ID: Joi.string().optional(),
  MICROSOFT_CALLBACK_URL: Joi.string().uri().optional(),
});
