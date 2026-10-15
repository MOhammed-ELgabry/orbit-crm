export const CHAT_REPOSITORY = Symbol('CHAT_REPOSITORY');

/** Conversation kinds (mirrors the ChatConversationType DB enum). */
export const CHAT_CONVERSATION_TYPES = ['TEAM', 'DIRECT'] as const;
export type ChatConversationKind = (typeof CHAT_CONVERSATION_TYPES)[number];

/** conversationKey of the single team conversation of a company. */
export const TEAM_CONVERSATION_KEY = 'TEAM';

// ---------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------

/** Characters. The column allows 8000; the product limit is lower on purpose. */
export const MESSAGE_MAX_LENGTH = 4000;

export const HISTORY_DEFAULT_LIMIT = 30;
export const HISTORY_MAX_LIMIT = 50;

/** Retries for a transaction that lost a race (stale epoch / deadlock). */
export const SEND_MAX_ATTEMPTS = 4;

/** clientMessageId: a UUID is expected, but any url-safe token is accepted. */
export const CLIENT_MESSAGE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** Upper bound of teammates returned by one call (company-internal list). */
export const TEAMMATES_MAX = 500;

// ---------------------------------------------------------------------
// Real-time transport + presence
//
// Values were derived from the implementation, not copied blindly:
//   - heartbeat 20 s: three missed heartbeats still fit inside one lease.
//   - lease 65 s: > 3 x heartbeat, so one or two lost/late heartbeats (a
//     busy tab, a slow mobile network) never flip a user offline.
//   - sweep 15 s: bounds how long an abandoned lease (server crash, hard
//     network loss) can keep a user "online" to lease + sweep = 80 s.
//   - disconnect grace 10 s: a clean disconnect shortens the lease instead
//     of deleting it, so a page reload / token-expiry reconnect / tab swap
//     never flashes the user offline for the whole company.
//   - session revalidation 5 s: the documented closure target for an
//     ineligible user is revalidation interval + processing, i.e. well
//     under 10 s while the database is reachable.
// ---------------------------------------------------------------------

export const WS_PATH = '/chat/ws';

export const HEARTBEAT_INTERVAL_MS = 20_000;
export const PRESENCE_LEASE_TTL_MS = 65_000;
export const PRESENCE_SWEEP_INTERVAL_MS = 15_000;
export const PRESENCE_DISCONNECT_GRACE_MS = 10_000;

export const SESSION_REVALIDATION_INTERVAL_MS = 5_000;
/**
 * If revalidation cannot reach the database for this long, connections are
 * closed (fail closed) rather than trusted indefinitely.
 */
export const SESSION_VALIDATION_MAX_STALENESS_MS = 20_000;

/** A connection that sends no heartbeat/pong for this long is dropped. */
export const WS_IDLE_TIMEOUT_MS = 50_000;
export const WS_MAX_PAYLOAD_BYTES = 2_048;
export const WS_MAX_CONNECTIONS_PER_USER = 10;
export const WS_MAX_INVALID_FRAMES = 5;

/** Application close codes (4000-4999 are reserved for applications). */
export const WS_CLOSE = {
  NORMAL: 1000,
  POLICY: 1008,
  TOKEN_EXPIRED: 4401,
  SESSION_INVALID: 4402,
  NOT_ELIGIBLE: 4403,
  SERVER_SHUTDOWN: 4500,
} as const;
