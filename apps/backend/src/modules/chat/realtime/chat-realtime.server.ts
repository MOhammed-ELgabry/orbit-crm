import { randomUUID } from 'crypto';
import type { IncomingMessage, Server as HttpServer } from 'http';
import type { Duplex } from 'stream';

import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { IJwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { AUTH_COOKIE_NAMES } from '../../auth/utils/cookie-options.util';
import {
  HEARTBEAT_INTERVAL_MS,
  SESSION_REVALIDATION_INTERVAL_MS,
  SESSION_VALIDATION_MAX_STALENESS_MS,
  WS_CLOSE,
  WS_IDLE_TIMEOUT_MS,
  WS_MAX_CONNECTIONS_PER_USER,
  WS_MAX_INVALID_FRAMES,
  WS_MAX_PAYLOAD_BYTES,
  WS_PATH,
} from '../chat.constants';
import type { ChatActor, ChatServerEvent } from '../chat.types';
import { errorName, parseCookieHeader, sleep } from '../chat.utils';
import { ChatEligibilityService } from '../chat-eligibility.service';
import { ChatHub } from '../chat-hub.service';
import { ChatPresenceService } from '../chat-presence.service';

import { SlidingWindowLimiter } from './sliding-window-limiter';

/** `ws` hands frames over as Buffer | ArrayBuffer | Buffer[]. */
function rawToString(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}

/** Why a handshake was refused (never reveals which check failed to the client). */
class HandshakeError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 429 | 503,
    readonly reason: string,
  ) {
    super(reason);
  }
}

interface ConnectionState {
  id: string;
  socket: WebSocket;
  userId: string;
  companyId: string;
  tokenExpiresAtMs: number;
  connectedAtMs: number;
  lastActivityMs: number;
  lastPingSentMs: number;
  lastLeaseTouchMs: number;
  /** Last time the DB confirmed this connection is still allowed. */
  lastValidatedMs: number;
  invalidFrames: number;
  recentFrames: number[];
  closed: boolean;
}

/** Upper bound for finishing in-flight presence writes on shutdown. */
const SHUTDOWN_DRAIN_MS = 3_000;

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  429: 'Too Many Requests',
  503: 'Service Unavailable',
};

/**
 * Authenticated, server-authorised real-time channel (`GET /chat/ws`).
 *
 * WHY `ws` and not Socket.IO: the app is a single NestJS process behind Nginx
 * and the browser WebSocket API is universally available, so Socket.IO's
 * polling fallback, long-polling session stickiness and extra protocol add
 * operational surface (sticky sessions, more Nginx locations) without a
 * benefit here. `ws` is a thin RFC 6455 server. Clients reconnect and
 * recover through REST history, which is needed with either library.
 *
 * HANDSHAKE (all checks fail closed; nothing is trusted from the client):
 *   1. Origin must equal the configured FRONTEND_URL origin. Auth cookies are
 *      SameSite=None in production, so without this any website could open
 *      a socket with the visitor's cookies (cross-site WebSocket hijacking).
 *      This replaces the CSRF header a browser WebSocket cannot send; the
 *      existing HTTP CSRF protection is untouched.
 *   2. The existing HttpOnly access-token cookie is verified with the
 *      existing JwtService (same secret/claims — nothing about tokens is
 *      changed). Tokens are never accepted from the URL.
 *   3. The user's CURRENT state is read from the database (active, not
 *      deleted, company active) and at least one live AuthSession must exist.
 *
 * AFTER the handshake, every REVALIDATION tick (default 5 s) re-checks all
 * connections with two batched queries and closes the ones that are no
 * longer allowed, plus any connection whose access token has expired.
 *
 * REVOCATION GUARANTEES (see docs/team-chat/SECURITY.md for the full table):
 *   - user deactivated/deleted, company deactivated/deleted/changed:
 *       closed within one tick (~5 s, target <= 10 s) — database reachable.
 *   - ALL of the user's AuthSessions revoked (password reset, "log out
 *       everywhere"): closed within one tick.
 *   - access token expiry: closed at `exp`; the client re-authenticates
 *       through the normal refresh flow, then reconnects.
 *   - logout of ONE session while another is alive: NOT detectable here (the
 *       access JWT carries no sessionId and the refresh cookie is scoped to
 *       /auth), so that device's socket lives until its token expires; the
 *       client closes its own socket on logout. This equals the guarantee
 *       existing HTTP calls already have (JwtAuthGuard doesn't check
 *       AuthSession either), and it is the one unresolved limitation.
 *   - database unreachable for > 20 s: connections are closed (fail closed).
 */
@Injectable()
export class ChatRealtimeServer
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ChatRealtimeServer.name);

  private wss?: WebSocketServer;
  private httpServer?: HttpServer;
  private upgradeListener?: (
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => void;

  private timer?: NodeJS.Timeout;
  private ticking = false;

  private readonly connections = new Map<string, ConnectionState>();

  /**
   * Presence writes that were started and not finished yet. Shutdown waits
   * (bounded) for them so no lease write is left half-way when the database
   * client is disconnected.
   */
  private readonly inFlight = new Set<Promise<unknown>>();
  private readonly handshakeLimiter = new SlidingWindowLimiter(30, 60_000);

  private allowedOrigin = '';

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly hub: ChatHub,
    private readonly presence: ChatPresenceService,
    private readonly eligibility: ChatEligibilityService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.configService.get<string>('CHAT_WS_ENABLED') === 'false') {
      this.logger.warn(
        'Chat real-time transport disabled (CHAT_WS_ENABLED=false).',
      );
      return;
    }

    const server = this.httpAdapterHost?.httpAdapter?.getHttpServer?.() as
      HttpServer | undefined;

    if (!server) return;

    this.attach(server);
  }

  /** Attaches the upgrade handler. Public so tests can use a bare server. */
  attach(server: HttpServer): void {
    if (this.wss) return;

    const frontendUrl = this.configService.getOrThrow<string>('frontendUrl');
    this.allowedOrigin = new URL(frontendUrl).origin;

    this.httpServer = server;
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: WS_MAX_PAYLOAD_BYTES,
      perMessageDeflate: false,
      clientTracking: false,
    });

    this.upgradeListener = (req, socket, head) => {
      void this.handleUpgrade(req, socket, head);
    };
    server.on('upgrade', this.upgradeListener);

    this.timer = setInterval(() => {
      void this.tick();
    }, SESSION_REVALIDATION_INTERVAL_MS);
    this.timer.unref();

    this.logger.log(`Chat real-time transport listening on ${WS_PATH}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);

    if (this.httpServer && this.upgradeListener) {
      this.httpServer.off('upgrade', this.upgradeListener);
    }

    for (const state of [...this.connections.values()]) {
      this.close(state, WS_CLOSE.SERVER_SHUTDOWN, 'server_shutdown', false);
    }

    this.wss?.close();

    // Let the lease writes triggered by the closes above finish (bounded:
    // a lease that is not released simply expires by its TTL anyway).
    if (this.inFlight.size > 0) {
      await Promise.race([
        Promise.allSettled([...this.inFlight]),
        sleep(SHUTDOWN_DRAIN_MS),
      ]);
    }
  }

  private track<T>(promise: Promise<T>): Promise<T> {
    this.inFlight.add(promise);
    const forget = () => {
      this.inFlight.delete(promise);
    };
    promise.then(forget, forget);
    return promise;
  }

  get connectionCount(): number {
    return this.connections.size;
  }

  // ---------------------------------------------------------------------
  // Handshake
  // ---------------------------------------------------------------------

  private async handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): Promise<void> {
    const path = (req.url ?? '').split('?')[0];

    if (path !== WS_PATH) {
      // Not ours. Nothing else upgrades connections in this app; do not
      // leave the socket dangling.
      if (this.httpServer && this.httpServer.listenerCount('upgrade') <= 1) {
        this.reject(socket, 404);
      }
      return;
    }

    const ip = this.clientIp(req);

    try {
      if (!this.handshakeLimiter.tryAcquire(ip)) {
        throw new HandshakeError(429, 'rate_limited');
      }

      const { actor, tokenExpiresAtMs } = await this.authenticate(req);

      if (this.hub.countForUser(actor.userId) >= WS_MAX_CONNECTIONS_PER_USER) {
        throw new HandshakeError(429, 'too_many_connections');
      }

      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        void this.onConnection(ws, actor, tokenExpiresAtMs);
      });
    } catch (error) {
      if (error instanceof HandshakeError) {
        this.reject(socket, error.status);
        return;
      }

      // Any unexpected failure while verifying = cannot verify = refuse.
      this.logger.error(`Handshake failed (${errorName(error)})`);
      this.reject(socket, 503);
    }
  }

  private async authenticate(
    req: IncomingMessage,
  ): Promise<{ actor: ChatActor; tokenExpiresAtMs: number }> {
    if (req.method !== 'GET') throw new HandshakeError(400, 'bad_method');

    // 1. Origin allow-list (exact match, no wildcard, header is mandatory).
    const origin = req.headers.origin;
    if (typeof origin !== 'string' || origin !== this.allowedOrigin) {
      throw new HandshakeError(403, 'origin_not_allowed');
    }

    // 2. The existing HttpOnly access cookie, verified by the existing JWT
    //    service. Never read from the URL/query string.
    const cookies = parseCookieHeader(req.headers.cookie);
    const token = cookies[AUTH_COOKIE_NAMES.accessToken];
    if (!token) throw new HandshakeError(401, 'no_token');

    let payload: IJwtPayload & { exp?: number };
    try {
      payload = this.jwtService.verify<IJwtPayload & { exp?: number }>(token);
    } catch {
      throw new HandshakeError(401, 'invalid_token');
    }

    if (!payload?.sub || typeof payload.exp !== 'number') {
      throw new HandshakeError(401, 'invalid_token');
    }

    // 3. Current server-side state: eligible user + company, live session.
    const actor = await this.eligibility.findActor(payload.sub);
    if (!actor) throw new HandshakeError(403, 'not_eligible');

    const sessions = await this.prisma.authSession.count({
      where: {
        userId: actor.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (sessions === 0) throw new HandshakeError(401, 'no_session');

    return { actor, tokenExpiresAtMs: payload.exp * 1000 };
  }

  private reject(socket: Duplex, status: number): void {
    try {
      socket.write(
        `HTTP/1.1 ${status} ${STATUS_TEXT[status] ?? 'Error'}\r\n` +
          'Connection: close\r\nContent-Length: 0\r\n\r\n',
      );
    } catch {
      // The peer may already be gone.
    }
    socket.destroy();
  }

  /**
   * Client address for throttling. The app trusts exactly one proxy hop
   * (see main.ts `trust proxy`), so the RIGHT-most X-Forwarded-For entry is
   * the one Nginx appended.
   */
  private clientIp(req: IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];
    const value = Array.isArray(forwarded)
      ? forwarded[forwarded.length - 1]
      : forwarded;

    if (typeof value === 'string' && value.length > 0) {
      const parts = value.split(',');
      return parts[parts.length - 1].trim().slice(0, 64);
    }

    return req.socket.remoteAddress ?? 'unknown';
  }

  // ---------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------

  private async onConnection(
    socket: WebSocket,
    actor: ChatActor,
    tokenExpiresAtMs: number,
  ): Promise<void> {
    const now = Date.now();

    const state: ConnectionState = {
      id: randomUUID(),
      socket,
      userId: actor.userId,
      companyId: actor.companyId,
      tokenExpiresAtMs,
      connectedAtMs: now,
      lastActivityMs: now,
      lastPingSentMs: now,
      lastLeaseTouchMs: now,
      lastValidatedMs: now,
      invalidFrames: 0,
      recentFrames: [],
      closed: false,
    };

    this.connections.set(state.id, state);

    this.hub.register({
      id: state.id,
      userId: state.userId,
      companyId: state.companyId,
      send: (event) => this.send(state, event),
    });

    socket.on('message', (data) => this.onMessage(state, data));
    socket.on('pong', () => this.onActivity(state));
    socket.on('error', () => socket.terminate());
    socket.on('close', () => this.onClosed(state, false));

    this.send(state, {
      type: 'ready',
      connectionId: state.id,
      serverTime: new Date(now).toISOString(),
      heartbeatMs: HEARTBEAT_INTERVAL_MS,
      tokenExpiresAt: new Date(tokenExpiresAtMs).toISOString(),
    });

    try {
      await this.track(
        this.presence.touch({
          connectionKey: state.id,
          userId: state.userId,
          companyId: state.companyId,
        }),
      );
    } catch (error) {
      // Presence is best-effort; chat itself keeps working.
      this.logger.error(`Presence registration failed (${errorName(error)})`);
    }

    // The socket may have closed while the lease was being written.
    if (state.closed) {
      void this.releaseLease(state, false);
    }
  }

  private onMessage(state: ConnectionState, data: RawData): void {
    if (state.closed) return;

    const now = Date.now();
    state.recentFrames = state.recentFrames.filter((t) => now - t < 10_000);
    state.recentFrames.push(now);

    // Flood protection: the only legitimate inbound traffic is a heartbeat
    // every ~20 s.
    if (state.recentFrames.length > 20) {
      this.close(state, WS_CLOSE.POLICY, 'rate_limited', false);
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawToString(data));
    } catch {
      this.rejectFrame(state, 'invalid_frame');
      return;
    }

    const type =
      parsed && typeof parsed === 'object'
        ? (parsed as { type?: unknown }).type
        : undefined;

    if (type === 'ping') {
      this.onActivity(state);
      this.send(state, { type: 'pong', serverTime: new Date().toISOString() });
      return;
    }

    // Everything else is refused. In particular there is no client-driven
    // subscribe/join/send/read over the socket: conversations are reached
    // only through the authorised REST endpoints, and what a connection
    // RECEIVES is decided by the server from its verified identity.
    this.rejectFrame(state, 'unsupported_event');
  }

  private rejectFrame(state: ConnectionState, code: string): void {
    state.invalidFrames += 1;
    this.send(state, { type: 'error', code });

    if (state.invalidFrames > WS_MAX_INVALID_FRAMES) {
      this.close(state, WS_CLOSE.POLICY, 'too_many_invalid_frames', false);
    }
  }

  /** Any sign of life renews the presence lease (throttled). */
  private onActivity(state: ConnectionState): void {
    const now = Date.now();
    state.lastActivityMs = now;

    if (now - state.lastLeaseTouchMs >= HEARTBEAT_INTERVAL_MS / 2) {
      state.lastLeaseTouchMs = now;

      void this.track(
        this.presence.touch({
          connectionKey: state.id,
          userId: state.userId,
          companyId: state.companyId,
        }),
      ).catch((error) => {
        this.logger.error(`Presence heartbeat failed (${errorName(error)})`);
      });
    }
  }

  private send(state: ConnectionState, event: ChatServerEvent): void {
    if (state.closed || state.socket.readyState !== state.socket.OPEN) return;
    state.socket.send(JSON.stringify(event));
  }

  /**
   * Closes a connection for an application reason. `immediate` ends the
   * presence lease at once (the user is no longer allowed to be here); the
   * normal path keeps a short grace so reconnects do not flash offline.
   */
  private close(
    state: ConnectionState,
    code: number,
    reason: string,
    immediate: boolean,
  ): void {
    if (state.closed) return;

    this.onClosed(state, immediate);

    try {
      state.socket.close(code, reason);
      // A peer that never completes the closing handshake must not linger.
      setTimeout(() => {
        if (state.socket.readyState !== state.socket.CLOSED) {
          state.socket.terminate();
        }
      }, 2_000).unref();
    } catch {
      state.socket.terminate();
    }
  }

  private onClosed(state: ConnectionState, immediate: boolean): void {
    if (state.closed) return;
    state.closed = true;

    this.connections.delete(state.id);
    this.hub.unregister(state.id);

    void this.releaseLease(state, immediate);
  }

  private async releaseLease(
    state: ConnectionState,
    immediate: boolean,
  ): Promise<void> {
    try {
      await this.track(
        this.presence.release(
          {
            connectionKey: state.id,
            userId: state.userId,
            companyId: state.companyId,
          },
          { immediate },
        ),
      );
    } catch (error) {
      // The lease simply expires on its own (bounded by its TTL).
      this.logger.error(`Presence release failed (${errorName(error)})`);
    }
  }

  // ---------------------------------------------------------------------
  // Periodic revalidation
  // ---------------------------------------------------------------------

  /** One revalidation pass. Public for deterministic tests. */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;

    try {
      await this.revalidate();
    } catch (error) {
      this.logger.error(`Revalidation failed (${errorName(error)})`);
      this.failClosedWhenStale();
    } finally {
      this.ticking = false;
    }
  }

  private async revalidate(): Promise<void> {
    const states = [...this.connections.values()];
    if (states.length === 0) return;

    const now = Date.now();

    // Cheap local checks first.
    for (const state of states) {
      if (now >= state.tokenExpiresAtMs) {
        this.close(state, WS_CLOSE.TOKEN_EXPIRED, 'token_expired', false);
        continue;
      }

      if (now - state.lastActivityMs > WS_IDLE_TIMEOUT_MS) {
        state.socket.terminate();
        continue;
      }

      if (now - state.lastPingSentMs >= HEARTBEAT_INTERVAL_MS) {
        state.lastPingSentMs = now;
        try {
          state.socket.ping();
        } catch {
          state.socket.terminate();
        }
      }
    }

    const live = [...this.connections.values()];
    if (live.length === 0) return;

    const userIds = [...new Set(live.map((s) => s.userId))];

    const [users, sessions] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          isActive: true,
          deletedAt: true,
          companyId: true,
          company: { select: { isActive: true, deletedAt: true } },
        },
      }),
      this.prisma.authSession.groupBy({
        by: ['userId'],
        where: {
          userId: { in: userIds },
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        _count: { _all: true },
      }),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const sessionUsers = new Set(sessions.map((s) => s.userId));
    const checkedAt = Date.now();

    for (const state of live) {
      if (state.closed) continue;

      const user = userMap.get(state.userId);

      const eligible =
        !!user &&
        user.isActive &&
        user.deletedAt === null &&
        user.companyId === state.companyId &&
        !!user.company &&
        user.company.isActive &&
        user.company.deletedAt === null;

      if (!eligible) {
        this.close(state, WS_CLOSE.NOT_ELIGIBLE, 'not_eligible', true);
        continue;
      }

      if (!sessionUsers.has(state.userId)) {
        this.close(state, WS_CLOSE.SESSION_INVALID, 'session_invalid', true);
        continue;
      }

      state.lastValidatedMs = checkedAt;
    }
  }

  /** The database could not confirm anything: stop trusting old answers. */
  private failClosedWhenStale(): void {
    const now = Date.now();

    for (const state of [...this.connections.values()]) {
      if (now - state.lastValidatedMs > SESSION_VALIDATION_MAX_STALENESS_MS) {
        this.close(
          state,
          WS_CLOSE.SESSION_INVALID,
          'validation_unavailable',
          false,
        );
      }
    }
  }
}
