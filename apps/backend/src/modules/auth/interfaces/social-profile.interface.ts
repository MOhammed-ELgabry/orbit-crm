/**
 * Normalized identity returned by a provider AFTER server-side
 * verification. Nothing in this shape is ever taken from raw,
 * unverified frontend input — every field is derived from a value the
 * provider's own server confirmed (a verified ID token, or a Graph API
 * response fetched using a token we ourselves validated).
 */
export interface ISocialProfile {
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  avatar: string | null;
}

/**
 * Every provider service (Google/Facebook/Microsoft) implements this same
 * shape so AuthService can treat all three interchangeably.
 */
export interface ISocialAuthProvider {
  /** True only when this provider's required env vars are all present. */
  isConfigured(): boolean;

  /** Builds the URL the popup should navigate to, embedding the signed CSRF state. */
  getAuthorizeUrl(state: string): Promise<string>;

  /** Exchanges an authorization code for a server-verified identity. */
  getProfile(code: string): Promise<ISocialProfile>;
}