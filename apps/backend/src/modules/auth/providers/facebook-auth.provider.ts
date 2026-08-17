import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  ISocialAuthProvider,
  ISocialProfile,
} from '../interfaces/social-profile.interface';

const GRAPH_API_VERSION = 'v19.0';

interface FacebookTokenResponse {
  access_token?: string;
}

interface FacebookDebugTokenResponse {
  data?: {
    is_valid?: boolean;
    app_id?: string;
    user_id?: string;
  };
}

interface FacebookMeResponse {
  id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  picture?: { data?: { url?: string } };
}

@Injectable()
export class FacebookAuthProvider implements ISocialAuthProvider {
  constructor(private readonly configService: ConfigService) {}

  private getConfig() {
    return {
      appId: this.configService.get<string>('socialAuth.facebook.appId'),
      appSecret: this.configService.get<string>(
        'socialAuth.facebook.appSecret',
      ),
      callbackUrl: this.configService.get<string>(
        'socialAuth.facebook.callbackUrl',
      ),
    };
  }

  isConfigured(): boolean {
    const { appId, appSecret, callbackUrl } = this.getConfig();

    return Boolean(appId && appSecret && callbackUrl);
  }

  async getAuthorizeUrl(state: string): Promise<string> {
    const { appId, callbackUrl } = this.getConfig();

    const params = new URLSearchParams({
      client_id: appId as string,
      redirect_uri: callbackUrl as string,
      state,
      scope: 'email,public_profile',
      response_type: 'code',
    });

    return `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;
  }

  async getProfile(code: string): Promise<ISocialProfile> {
    const { appId, appSecret, callbackUrl } = this.getConfig();

    // 1. Exchange the authorization code for a user access token — this
    //    call is made server-to-server using our app secret, never
    //    exposed to the frontend.
    const tokenParams = new URLSearchParams({
      client_id: appId as string,
      client_secret: appSecret as string,
      redirect_uri: callbackUrl as string,
      code,
    });

    const tokenResponse = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token?${tokenParams.toString()}`,
    );

    if (!tokenResponse.ok) {
      throw new BadRequestException('Facebook authentication failed.');
    }

    const tokenData = (await tokenResponse.json()) as FacebookTokenResponse;
    const userAccessToken = tokenData.access_token;

    if (!userAccessToken) {
      throw new BadRequestException('Facebook authentication failed.');
    }

    // 2. Verify the access token was actually issued for OUR app, using
    //    Facebook's debug_token endpoint with our app access token
    //    (appId|appSecret). This is the server-side verification step —
    //    without it we'd be trusting a token we never confirmed belongs
    //    to our own app registration.
    const appAccessToken = `${appId}|${appSecret}`;

    const debugResponse = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(
        userAccessToken,
      )}&access_token=${encodeURIComponent(appAccessToken)}`,
    );

    if (!debugResponse.ok) {
      throw new BadRequestException('Facebook authentication failed.');
    }

    const debugData = (await debugResponse.json()) as FacebookDebugTokenResponse;

    if (
      !debugData.data?.is_valid ||
      debugData.data.app_id !== appId ||
      !debugData.data.user_id
    ) {
      throw new BadRequestException('Facebook authentication failed.');
    }

    // 3. Fetch the profile using the verified token.
    const meParams = new URLSearchParams({
      fields: 'id,first_name,last_name,email,picture',
      access_token: userAccessToken,
    });

    const meResponse = await fetch(
      `https://graph.facebook.com/me?${meParams.toString()}`,
    );

    if (!meResponse.ok) {
      throw new BadRequestException('Facebook authentication failed.');
    }

    const me = (await meResponse.json()) as FacebookMeResponse;

    if (!me.id || me.id !== debugData.data.user_id) {
      throw new BadRequestException('Facebook authentication failed.');
    }

    return {
      providerAccountId: me.id,
      email: me.email ?? null,
      // Facebook's Graph API does not return an explicit "email_verified"
      // flag the way Google/Microsoft's OIDC ID tokens do. Facebook only
      // returns the `email` field at all when the user has a confirmed
      // email on their account and has granted the `email` permission —
      // in practice this is the closest signal available, so its presence
      // is treated as sufficient verification. This is a deliberate,
      // documented decision (not a silent assumption): if this is judged
      // too permissive for your risk tolerance, email-based auto-linking
      // for Facebook specifically (Scenario 3) can be disabled without
      // touching Google/Microsoft.
      emailVerified: Boolean(me.email),
      firstName: me.first_name ?? 'Facebook',
      lastName: me.last_name ?? 'User',
      avatar: me.picture?.data?.url ?? null,
    };
  }
}