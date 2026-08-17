import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

import type {
  ISocialAuthProvider,
  ISocialProfile,
} from '../interfaces/social-profile.interface';

@Injectable()
export class GoogleAuthProvider implements ISocialAuthProvider {
  constructor(private readonly configService: ConfigService) {}

  private getConfig() {
    return {
      clientId: this.configService.get<string>('socialAuth.google.clientId'),
      clientSecret: this.configService.get<string>(
        'socialAuth.google.clientSecret',
      ),
      callbackUrl: this.configService.get<string>(
        'socialAuth.google.callbackUrl',
      ),
    };
  }

  isConfigured(): boolean {
    const { clientId, clientSecret, callbackUrl } = this.getConfig();

    return Boolean(clientId && clientSecret && callbackUrl);
  }

  private getClient(): OAuth2Client {
    const { clientId, clientSecret, callbackUrl } = this.getConfig();

    return new OAuth2Client(clientId, clientSecret, callbackUrl);
  }

  async getAuthorizeUrl(state: string): Promise<string> {
    const client = this.getClient();

    return client.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      prompt: 'select_account',
      state,
    });
  }

  async getProfile(code: string): Promise<ISocialProfile> {
    const { clientId, callbackUrl } = this.getConfig();
    const client = this.getClient();

    let idToken: string | null | undefined;

    try {
      const { tokens } = await client.getToken({
        code,
        redirect_uri: callbackUrl,
      });

      idToken = tokens.id_token;
    } catch {
      throw new BadRequestException('Google authentication failed.');
    }

    if (!idToken) {
      throw new BadRequestException('Google authentication failed.');
    }

    // verifyIdToken checks the signature against Google's published JWKS,
    // the issuer, and the audience (our own client ID) — this is what
    // makes the returned claims trustworthy, unlike anything the frontend
    // could have sent us directly.
    let payload: TokenPayload | undefined;

    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: clientId,
      });

      payload = ticket.getPayload();
    } catch {
      throw new BadRequestException('Google authentication failed.');
    }

    if (!payload || !payload.sub) {
      throw new BadRequestException('Google authentication failed.');
    }

    return {
      providerAccountId: payload.sub,
      email: payload.email ?? null,
      emailVerified: Boolean(payload.email_verified),
      firstName: payload.given_name ?? payload.name ?? 'Google',
      lastName: payload.family_name ?? 'User',
      avatar: payload.picture ?? null,
    };
  }
}