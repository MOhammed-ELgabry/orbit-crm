import * as https from 'https';

import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';

import {
  PUSH_SEND_TIMEOUT_MS,
  PUSH_TTL_SECONDS,
} from './constants/notification.constants';
import type { PushPayload } from './notification.templates';
import {
  createSafeLookup,
  PushEndpointError,
  validatePushEndpoint,
  validatePushKeys,
  type ResolveAll,
} from './push-endpoint.validator';

export type PushSendErrorCode =
  | 'not_configured'
  | 'endpoint_invalid'
  | 'keys_invalid'
  | 'blocked_address'
  | 'dns_failed'
  | 'gone'
  | 'redirect_rejected'
  | 'rejected'
  | 'rate_limited'
  | 'server_error'
  | 'timeout'
  | 'network_error';

/**
 * The ONLY error type that leaves WebPushService. It carries a short
 * code and nothing else: the original WebPushError (which embeds the
 * endpoint, response headers and body) and the endpoint itself are never
 * logged, stored, or re-thrown.
 */
export class PushSendError extends Error {
  constructor(public readonly code: PushSendErrorCode) {
    super(`notification_delivery_failed:push:${code}`);
    this.name = 'PushSendError';
  }

  /** The subscription can never work again (remove it). */
  get permanent(): boolean {
    return (
      this.code === 'gone' ||
      this.code === 'endpoint_invalid' ||
      this.code === 'keys_invalid'
    );
  }
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface WebPushSenderOptions {
  /** Test seams — production uses the defaults. */
  sendNotification?: typeof webpush.sendNotification;
  resolveAll?: ResolveAll;
  timeoutMs?: number;
}

@Injectable()
export class WebPushService {
  private readonly sendNotification: typeof webpush.sendNotification;
  private readonly resolveAll?: ResolveAll;
  private readonly timeoutMs: number;

  constructor(
    private readonly configService: ConfigService,
    @Optional() options: WebPushSenderOptions = {},
  ) {
    this.sendNotification =
      options.sendNotification ?? webpush.sendNotification;
    this.resolveAll = options.resolveAll;
    this.timeoutMs = options.timeoutMs ?? PUSH_SEND_TIMEOUT_MS;
  }

  private get publicKey(): string | undefined {
    return this.configService.get<string>('VAPID_PUBLIC_KEY') || undefined;
  }

  private get privateKey(): string | undefined {
    return this.configService.get<string>('VAPID_PRIVATE_KEY') || undefined;
  }

  private get subject(): string | undefined {
    return this.configService.get<string>('VAPID_SUBJECT') || undefined;
  }

  /** Web Push is available only when VAPID is fully configured. */
  isConfigured(): boolean {
    return Boolean(this.publicKey && this.privateKey && this.subject);
  }

  getPublicKey(): string | null {
    return this.isConfigured() ? (this.publicKey as string) : null;
  }

  /**
   * Sends one push. Re-validates the endpoint/keys (send-time check),
   * pins the connection to a validated public IP through a dedicated
   * https.Agent, never follows redirects, keeps TLS verification on and
   * bounds the total time.
   */
  async send(target: PushTarget, payload: PushPayload): Promise<void> {
    if (!this.isConfigured()) throw new PushSendError('not_configured');

    try {
      validatePushEndpoint(target.endpoint);
    } catch {
      throw new PushSendError('endpoint_invalid');
    }

    try {
      validatePushKeys(target.p256dh, target.auth);
    } catch {
      throw new PushSendError('keys_invalid');
    }

    // One short-lived agent per send: no keep-alive, no socket reuse, so
    // every request re-resolves and re-checks the destination.
    const agent = new https.Agent({
      keepAlive: false,
      maxSockets: 1,
      lookup: createSafeLookup(this.resolveAll),
    } as https.AgentOptions);

    let timer: NodeJS.Timeout | undefined;

    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        agent.destroy();
        reject(new PushSendError('timeout'));
      }, this.timeoutMs);
      timer.unref?.();
    });

    try {
      await Promise.race([
        this.sendNotification(
          {
            endpoint: target.endpoint,
            keys: { p256dh: target.p256dh, auth: target.auth },
          },
          JSON.stringify(payload),
          {
            TTL: PUSH_TTL_SECONDS,
            urgency: 'normal',
            timeout: this.timeoutMs,
            agent,
            vapidDetails: {
              subject: this.subject as string,
              publicKey: this.publicKey as string,
              privateKey: this.privateKey as string,
            },
          },
        ),
        deadline,
      ]);
    } catch (error) {
      throw this.toSendError(error);
    } finally {
      if (timer) clearTimeout(timer);
      agent.destroy();
    }
  }

  private toSendError(error: unknown): PushSendError {
    if (error instanceof PushSendError) return error;

    if (error instanceof PushEndpointError) {
      return new PushSendError(
        error.code === 'blocked_address' ? 'blocked_address' : 'dns_failed',
      );
    }

    const { statusCode, code, message } = error as {
      statusCode?: number;
      code?: string;
      message?: string;
    };

    if (typeof statusCode === 'number') {
      if (statusCode === 404 || statusCode === 410)
        return new PushSendError('gone');
      if (statusCode >= 300 && statusCode < 400)
        return new PushSendError('redirect_rejected');
      if (statusCode === 429) return new PushSendError('rate_limited');
      if (statusCode >= 500) return new PushSendError('server_error');
      return new PushSendError('rejected');
    }

    if (code === 'EBLOCKED') return new PushSendError('blocked_address');
    if (code === 'ENOTFOUND') return new PushSendError('dns_failed');
    if (message === 'Socket timeout') return new PushSendError('timeout');

    return new PushSendError('network_error');
  }
}
