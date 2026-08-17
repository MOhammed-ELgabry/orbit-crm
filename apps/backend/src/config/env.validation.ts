import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  PORT: Joi.number().required(),

  JWT_ACCESS_SECRET: Joi.string().required(),

  JWT_REFRESH_SECRET: Joi.string().required(),

  ACCESS_TOKEN_EXPIRES_IN: Joi.string().required(),

  REFRESH_TOKEN_EXPIRES_IN: Joi.string().required(),

  // Social Authentication — all OPTIONAL so existing deployments without
  // these configured keep booting exactly as before. When present, format
  // is validated; each provider is checked for completeness at request
  // time by its own provider service.
  FRONTEND_URL: Joi.string().uri().optional(),

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