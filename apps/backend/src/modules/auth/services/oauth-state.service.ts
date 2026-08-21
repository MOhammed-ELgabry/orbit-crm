import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — matches the popup flow's expected duration

/**
 * Generates and verifies the OAuth `state` parameter used to prevent CSRF
 * on the social-login callback. Deliberately stateless (no DB row, no
 * server session) — the state itself carries an HMAC signature over its
 * own contents, so tampering or reuse past its TTL is detectable without
 * needing to look anything up.
 */
@Injectable()
export class OAuthStateService {
  constructor(private readonly configService: ConfigService) {}

  private getSecret(): string {
    const secret = this.configService.get<string>('socialAuth.stateSecret');

    if (!secret) {
      throw new ServiceUnavailableException(
        'Social authentication is not configured.',
      );
    }

    return secret;
  }

  generate(provider: string): string {
    const secret = this.getSecret();

    const nonce = randomBytes(16).toString('hex');
    const issuedAt = Date.now().toString();
    const payload = `${provider}.${nonce}.${issuedAt}`;

    const signature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return Buffer.from(`${payload}.${signature}`).toString('base64url');
  }

  verify(provider: string, state: string): boolean {
    let secret: string;

    try {
      secret = this.getSecret();
    } catch {
      return false;
    }

    try {
      const decoded = Buffer.from(state, 'base64url').toString('utf8');
      const parts = decoded.split('.');

      if (parts.length !== 4) {
        return false;
      }

      const [stateProvider, nonce, issuedAt, signature] = parts;

      if (stateProvider !== provider) {
        return false;
      }

      const payload = `${stateProvider}.${nonce}.${issuedAt}`;

      const expectedSignature = createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const provided = Buffer.from(signature, 'hex');
      const expected = Buffer.from(expectedSignature, 'hex');

      if (
        provided.length !== expected.length ||
        !timingSafeEqual(provided, expected)
      ) {
        return false;
      }

      const age = Date.now() - Number.parseInt(issuedAt, 10);

      if (Number.isNaN(age) || age < 0 || age > STATE_TTL_MS) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }
}
