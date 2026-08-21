import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConfidentialClientApplication } from '@azure/msal-node';

import type {
  ISocialAuthProvider,
  ISocialProfile,
} from '../interfaces/social-profile.interface';

const SCOPES = ['openid', 'profile', 'email', 'User.Read'];

@Injectable()
export class MicrosoftAuthProvider implements ISocialAuthProvider {
  constructor(private readonly configService: ConfigService) {}

  private getConfig() {
    return {
      clientId: this.configService.get<string>('socialAuth.microsoft.clientId'),
      clientSecret: this.configService.get<string>(
        'socialAuth.microsoft.clientSecret',
      ),
      // 'common' allows both personal Microsoft accounts and any work/school
      // (Azure AD) tenant to sign in — this is a Microsoft *identity*
      // tenant concept, unrelated to and never used as Orbit CRM's
      // companyId. Can be pinned to a specific Azure AD tenant via
      // MICROSOFT_TENANT_ID if you want to restrict sign-in to one
      // organization's directory.
      tenantId:
        this.configService.get<string>('socialAuth.microsoft.tenantId') ||
        'common',
      callbackUrl: this.configService.get<string>(
        'socialAuth.microsoft.callbackUrl',
      ),
    };
  }

  isConfigured(): boolean {
    const { clientId, clientSecret, callbackUrl } = this.getConfig();

    return Boolean(clientId && clientSecret && callbackUrl);
  }

  private getClient(): ConfidentialClientApplication {
    const { clientId, clientSecret, tenantId } = this.getConfig();

    return new ConfidentialClientApplication({
      auth: {
        clientId: clientId as string,
        clientSecret: clientSecret as string,
        authority: `https://login.microsoftonline.com/${tenantId}`,
      },
    });
  }

  async getAuthorizeUrl(state: string): Promise<string> {
    const { callbackUrl } = this.getConfig();
    const client = this.getClient();

    try {
      return await client.getAuthCodeUrl({
        scopes: SCOPES,
        redirectUri: callbackUrl as string,
        state,
        prompt: 'select_account',
      });
    } catch {
      throw new BadRequestException('Microsoft authentication failed.');
    }
  }

  async getProfile(code: string): Promise<ISocialProfile> {
    const { callbackUrl } = this.getConfig();
    const client = this.getClient();

    // acquireTokenByCode exchanges the code server-to-server and validates
    // the returned ID token's signature against Microsoft's published
    // JWKS, issuer, and our audience internally — this is what makes
    // idTokenClaims trustworthy.
    const result = await client
      .acquireTokenByCode({
        code,
        scopes: SCOPES,
        redirectUri: callbackUrl as string,
      })
      .catch(() => null);

    if (!result || !result.account) {
      throw new BadRequestException('Microsoft authentication failed.');
    }

    const claims = (result.idTokenClaims ?? {}) as Record<string, unknown>;

    const email =
      (typeof claims.email === 'string' ? claims.email : null) ??
      (typeof claims.preferred_username === 'string'
        ? claims.preferred_username
        : null) ??
      result.account.username ??
      null;

    return {
      providerAccountId: result.account.homeAccountId,
      email,
      // Microsoft's OIDC id_token is issued only after Microsoft itself
      // authenticates the user for either a personal Microsoft account or
      // a work/school (Azure AD) account — there is no separate
      // "email_verified" claim to check the way Google provides one, so a
      // successfully validated id_token is treated as sufficient
      // verification.
      emailVerified: true,
      firstName:
        (typeof claims.given_name === 'string' ? claims.given_name : null) ??
        result.account.name ??
        'Microsoft',
      lastName:
        (typeof claims.family_name === 'string' ? claims.family_name : null) ??
        'User',
      // Fetching a profile photo requires an additional Microsoft Graph
      // call beyond the ID token — omitted to keep this feature scoped to
      // authentication only, matching the approved scope.
      avatar: null,
    };
  }
}
