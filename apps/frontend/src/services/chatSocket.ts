import { API_BASE_URL } from "./api";
import type { ChatServerEvent } from "../types/chat";

/**
 * Browser client of the Team Chat WebSocket (`/chat/ws`).
 *
 * Security model (why there is no token handling here): the socket is opened
 * with the same HttpOnly cookies as the REST API. The browser sets the Origin
 * header itself and the server accepts only the configured frontend origin,
 * then re-validates the user/company/session every few seconds. The client
 * never tells the server who it is or which rooms it wants — it can only
 * send `{type:"ping"}`; everything it receives was scoped on the server.
 *
 * Failure model: any loss of the connection (network, token expiry, server
 * restart, revalidation closing the socket) leads to a probe of the REST
 * session — which performs the one shared cookie refresh — and a reconnect
 * with exponential backoff. When the probe says the account may no longer
 * use chat the client stops instead of retrying forever. Missed events are
 * recovered by the caller on every `ready` (REST is the source of truth).
 */

export type ChatSocketStatus =
  "connecting" | "online" | "reconnecting" | "unavailable" | "stopped";

export type SessionProbeResult = "ok" | "denied" | "retry";

/** The subset of the browser WebSocket this client relies on. */
export interface WebSocketLike {
  readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

const WS_OPEN = 1;

/** Application close codes (mirror the backend `WS_CLOSE`). */
export const CHAT_CLOSE = {
  NORMAL: 1000,
  POLICY: 1008,
  TOO_BIG: 1009,
  TOKEN_EXPIRED: 4401,
  SESSION_INVALID: 4402,
  NOT_ELIGIBLE: 4403,
  SHUTDOWN: 4500,
} as const;

export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;
/** A socket that never sends `ready` within this time is abandoned. */
export const READY_TIMEOUT_MS = 10_000;
/** Heartbeat used until the server announces its own in `ready`. */
export const DEFAULT_HEARTBEAT_MS = 20_000;
/**
 * A connection must stay up this long before the backoff resets. Without it a
 * server that accepts and then immediately drops the socket would be retried
 * (and its session probed) once a second, forever.
 */
export const STABLE_AFTER_MS = 10_000;
/** Silence tolerated, in heartbeats, before the connection is declared dead. */
const SILENCE_HEARTBEATS = 2.5;

const KNOWN_EVENTS = new Set<ChatServerEvent["type"]>([
  "ready",
  "pong",
  "message.new",
  "read.updated",
  "presence.update",
  "error",
]);

/** http(s)://host[:port][/prefix] -> ws(s)://host[:port][/prefix]/chat/ws */
export function buildChatSocketUrl(apiBaseUrl: string = API_BASE_URL): string {
  const url = new URL(apiBaseUrl);

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/chat/ws`;
  url.search = "";
  url.hash = "";

  return url.toString();
}

/** Parses one frame; anything malformed or unknown is dropped, never thrown. */
export function parseChatEvent(raw: unknown): ChatServerEvent | null {
  if (typeof raw !== "string") return null;

  try {
    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      typeof parsed.type === "string" &&
      KNOWN_EVENTS.has(parsed.type as ChatServerEvent["type"])
    ) {
      return parsed as ChatServerEvent;
    }
  } catch {
    // fall through
  }

  return null;
}

/** Delay before reconnect attempt number `attempt` (1-based). */
export function backoffDelay(
  attempt: number,
  closeCode: number | undefined,
  random: () => number = Math.random,
): number {
  // The token expired: the very next handshake needs the refreshed cookie,
  // which the session probe obtains — no reason to wait.
  if (closeCode === CHAT_CLOSE.TOKEN_EXPIRED && attempt <= 1) return 0;

  const exponential = Math.min(
    BACKOFF_MAX_MS,
    BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1),
  );
  // Full jitter on the upper half: spreads a fleet of reconnecting tabs.
  let delay = Math.round(exponential * (0.5 + random() * 0.5));

  // Policy violations / oversized frames are never fixed by retrying fast.
  if (closeCode === CHAT_CLOSE.POLICY) delay = Math.max(delay, 5_000);
  if (closeCode === CHAT_CLOSE.TOO_BIG) delay = Math.max(delay, BACKOFF_MAX_MS);

  return delay;
}

export interface ChatSocketOptions {
  url?: string;
  /** Validates (and if needed refreshes) the REST session. */
  probeSession: () => Promise<SessionProbeResult>;
  onEvent: (event: ChatServerEvent) => void;
  onStatus: (status: ChatSocketStatus) => void;
  createSocket?: (url: string) => WebSocketLike;
  random?: () => number;
}

export class ChatSocket {
  private readonly url: string;
  private readonly createSocket: (url: string) => WebSocketLike;
  private readonly random: () => number;

  private socket: WebSocketLike | null = null;
  private status: ChatSocketStatus = "stopped";
  private running = false;
  private attempt = 0;
  private generation = 0;
  private connecting = false;

  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private readyTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private silenceTimer: ReturnType<typeof setTimeout> | undefined;
  private stableTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeatMs = DEFAULT_HEARTBEAT_MS;
  private readonly options: ChatSocketOptions;

  constructor(options: ChatSocketOptions) {
    this.options = options;
    this.url = options.url ?? buildChatSocketUrl();
    this.random = options.random ?? Math.random;
    this.createSocket =
      options.createSocket ??
      ((url) => new WebSocket(url) as unknown as WebSocketLike);
  }

  getStatus(): ChatSocketStatus {
    return this.status;
  }

  start(): void {
    if (this.running) return;

    this.running = true;
    this.attempt = 0;
    this.generation += 1;
    this.setStatus("connecting");
    void this.connect();
  }

  stop(): void {
    this.running = false;
    this.generation += 1;
    this.clearTimers();
    this.detach(this.socket, CHAT_CLOSE.NORMAL);
    this.socket = null;
    this.connecting = false;
    this.setStatus("stopped");
  }

  /**
   * The tab became visible again / the network came back: do not wait for
   * the backoff timer when the connection is down.
   */
  nudge(): void {
    if (!this.running || this.status === "online") return;
    if (this.status === "unavailable") return;
    if (this.connecting || this.socket) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    this.attempt = 0;
    this.setStatus("reconnecting");
    void this.connect();
  }

  // --- connection ------------------------------------------------------

  private async connect(): Promise<void> {
    if (!this.running || this.connecting || this.socket) return;

    this.connecting = true;
    const generation = this.generation;

    let verdict: SessionProbeResult;

    try {
      verdict = await this.options.probeSession();
    } catch {
      verdict = "retry";
    }

    // stop()/start() ran while the probe was in flight.
    if (!this.running || generation !== this.generation) return;
    this.connecting = false;

    if (verdict === "denied") {
      this.running = false;
      this.clearTimers();
      this.setStatus("unavailable");
      return;
    }

    if (verdict === "retry") {
      this.scheduleReconnect(undefined);
      return;
    }

    this.open(generation);
  }

  private open(generation: number): void {
    let socket: WebSocketLike;

    try {
      socket = this.createSocket(this.url);
    } catch {
      this.scheduleReconnect(undefined);
      return;
    }

    this.socket = socket;

    this.readyTimer = setTimeout(() => {
      if (this.socket === socket && this.status !== "online") {
        this.handleLost(socket, undefined);
      }
    }, READY_TIMEOUT_MS);

    socket.onmessage = (event) => {
      if (this.socket !== socket || generation !== this.generation) return;

      this.armSilenceTimer(socket);

      const parsed = parseChatEvent(event.data);
      if (!parsed) return;

      if (parsed.type === "ready") {
        this.onReady(socket, parsed);
      }

      this.options.onEvent(parsed);
    };

    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.handleLost(socket, event.code);
    };

    // A failing socket always ends in `close`; errors carry no usable detail.
    socket.onerror = () => undefined;
  }

  private onReady(
    socket: WebSocketLike,
    event: Extract<ChatServerEvent, { type: "ready" }>,
  ): void {
    this.heartbeatMs =
      Number.isFinite(event.heartbeatMs) && event.heartbeatMs >= 1_000
        ? event.heartbeatMs
        : DEFAULT_HEARTBEAT_MS;

    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = undefined;
    }

    if (this.stableTimer) clearTimeout(this.stableTimer);
    this.stableTimer = setTimeout(() => {
      if (this.socket === socket) this.attempt = 0;
    }, STABLE_AFTER_MS);

    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.socket === socket && socket.readyState === WS_OPEN) {
        try {
          socket.send(JSON.stringify({ type: "ping" }));
        } catch {
          // The close handler will deal with a broken socket.
        }
      }
    }, this.heartbeatMs);

    this.armSilenceTimer(socket);
    this.setStatus("online");
  }

  /** Dead-connection detection: no frame at all for 2.5 heartbeats. */
  private armSilenceTimer(socket: WebSocketLike): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    if (this.status !== "online" && !this.heartbeatTimer) return;

    this.silenceTimer = setTimeout(() => {
      if (this.socket === socket) this.handleLost(socket, undefined);
    }, this.heartbeatMs * SILENCE_HEARTBEATS);
  }

  private handleLost(socket: WebSocketLike, code: number | undefined): void {
    if (this.socket !== socket) return;

    this.detach(socket, CHAT_CLOSE.NORMAL);
    this.socket = null;
    this.clearTimers();

    if (!this.running) return;
    this.scheduleReconnect(code);
  }

  private scheduleReconnect(code: number | undefined): void {
    this.connecting = false;
    this.attempt += 1;
    this.setStatus("reconnecting");

    const delay = backoffDelay(this.attempt, code, this.random);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, delay);
  }

  // --- helpers ---------------------------------------------------------

  private detach(socket: WebSocketLike | null, code: number): void {
    if (!socket) return;

    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;

    try {
      socket.close(code);
    } catch {
      // Already closed.
    }
  }

  private clearTimers(): void {
    for (const timer of [this.reconnectTimer, this.readyTimer]) {
      if (timer) clearTimeout(timer);
    }
    for (const timer of [this.silenceTimer, this.stableTimer]) {
      if (timer) clearTimeout(timer);
    }
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.stableTimer = undefined;
    this.reconnectTimer = undefined;
    this.readyTimer = undefined;
    this.silenceTimer = undefined;
    this.heartbeatTimer = undefined;
  }

  private setStatus(next: ChatSocketStatus): void {
    if (this.status === next) return;

    this.status = next;
    this.options.onStatus(next);
  }
}
