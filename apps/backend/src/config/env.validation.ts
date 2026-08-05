import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  PORT: Joi.number().required(),

  JWT_ACCESS_SECRET: Joi.string().required(),

  JWT_REFRESH_SECRET: Joi.string().required(),

  ACCESS_TOKEN_EXPIRES_IN: Joi.string().required(),

  REFRESH_TOKEN_EXPIRES_IN: Joi.string().required(),
});
