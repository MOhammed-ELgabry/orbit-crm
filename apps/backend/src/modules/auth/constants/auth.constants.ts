export const AUTH_REPOSITORY = 'AUTH_REPOSITORY';
export const AUTH_SESSION_REPOSITORY = 'AUTH_SESSION_REPOSITORY';
export const PASSWORD_RESET_REPOSITORY = 'PASSWORD_RESET_REPOSITORY';
export const SOCIAL_ACCOUNT_REPOSITORY = 'SOCIAL_ACCOUNT_REPOSITORY';

/**
 * The only three social providers this application supports. Used to
 * validate the :provider route param before it's trusted anywhere.
 */
export const SOCIAL_PROVIDERS = ['google', 'facebook', 'microsoft'] as const;
export type SocialProviderName = (typeof SOCIAL_PROVIDERS)[number];