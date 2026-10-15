import * as chatApi from "../services/chatService";
import {
  ChatSocket,
  type ChatSocketOptions,
  type SessionProbeResult,
} from "../services/chatSocket";
import {
  CHAT_HISTORY_PAGE_SIZE,
  CHAT_MESSAGE_MAX_LENGTH,
  type ChatConversation,
  type ChatServerEvent,
} from "../types/chat";
import {
  chatReducer,
  initialChatState,
  type ChatAction,
  type ChatState,
  type PendingMessage,
} from "./chatState";

/** The REST calls the store needs (injectable for tests). */
export type ChatApi = Pick<
  typeof chatApi,
  | "getChatSession"
  | "getChatBootstrap"
  | "listChatConversations"
  | "openDirectConversation"
  | "getChatMessages"
  | "getChatReceipts"
  | "sendChatMessage"
  | "markChatRead"
>;

export interface ChatStoreDeps {
  api?: ChatApi;
  createSocket?: ChatSocketOptions["createSocket"];
  socketUrl?: string;
  newClientMessageId?: () => string;
}

export type SendOutcome =
  | { ok: true; clientMessageId: string }
  | { ok: false; reason: "empty" | "too_long" | "unavailable" };

/** Debounce of the read acknowledgement (coalesces bursts of messages). */
export const READ_DEBOUNCE_MS = 250;

/** What `ChatStore.subscribeActivity` reports (see there). */
export type ChatActivityKind = "incoming" | "read";
export const REFRESH_DEBOUNCE_MS = 300;
export const RECEIPTS_DEBOUNCE_MS = 500;
/** Recovery pages (50 each) fetched after a reconnect before falling back. */
const MAX_RECOVERY_PAGES = 5;
const RECOVERY_PAGE_SIZE = 50;
/** Backend limit: `to - from` must not exceed 500. */
const RECEIPT_MAX_SPAN = 500;

/** Mirrors the server-side normalisation of a message body. */
export function normalizeChatBody(value: string): string {
  return (
    value
      .replace(/\r\n?/g, "\n")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .trim()
  );
}

function generateClientMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  // Matches the server pattern ^[A-Za-z0-9_-]{8,64}$.
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * All Team Chat behaviour outside React: REST calls, the socket lifecycle,
 * optimistic sends, read acknowledgements and recovery after a reconnect.
 * React only subscribes (`useSyncExternalStore`). One instance exists per
 * signed-in user; `stop()` releases every timer, listener and socket, and
 * every async continuation checks `generation` so nothing of a stopped
 * (signed-out) store can write state or call the API afterwards.
 */
export class ChatStore {
  private state: ChatState = initialChatState;
  private readonly listeners = new Set<() => void>();
  private readonly activityListeners = new Set<
    (kind: ChatActivityKind) => void
  >();

  private readonly api: ChatApi;
  private readonly deps: ChatStoreDeps;
  private readonly newClientMessageId: () => string;

  private socket: ChatSocket | null = null;
  private started = false;
  private generation = 0;

  private viewport: { conversationId: string | null; atBottom: boolean } = {
    conversationId: null,
    atBottom: true,
  };

  private readTimer: ReturnType<typeof setTimeout> | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly receiptTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  private readonly lastReadRequested = new Map<string, number>();
  private readonly inFlightSends = new Set<string>();
  private syncing = false;
  private syncQueued = false;

  constructor(deps: ChatStoreDeps = {}) {
    this.deps = deps;
    this.api = deps.api ?? chatApi;
    this.newClientMessageId =
      deps.newClientMessageId ?? generateClientMessageId;
  }

  // --- external-store contract ------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ChatState => this.state;

  /**
   * Cheap side-channel for "something happened that can change the user's
   * NOTIFICATION counter": a message from someone else arrived over the
   * existing socket, or a read acknowledgement went through (the server then
   * marks the matching chat notifications read). It carries no data and
   * opens no connection; the notifications layer decides what to do with it.
   * A throwing listener can never affect chat: errors are swallowed here.
   */
  subscribeActivity = (listener: (kind: ChatActivityKind) => void) => {
    this.activityListeners.add(listener);

    return () => {
      this.activityListeners.delete(listener);
    };
  };

  private emitActivity(kind: ChatActivityKind): void {
    for (const listener of [...this.activityListeners]) {
      try {
        listener(kind);
      } catch {
        // Never let an observer break message handling.
      }
    }
  }

  private dispatch(action: ChatAction): void {
    const next = chatReducer(this.state, action);
    if (next === this.state) return;

    this.state = next;
    for (const listener of [...this.listeners]) listener();
  }

  // --- lifecycle ----------------------------------------------------------

  start(): void {
    if (this.started) return;

    this.started = true;
    this.generation += 1;

    if (this.state.phase === "idle")
      this.dispatch({ type: "phase", phase: "loading" });

    void this.loadBootstrap();

    this.socket = new ChatSocket({
      url: this.deps.socketUrl,
      createSocket: this.deps.createSocket,
      probeSession: () => this.probeSession(),
      onEvent: (event) => this.handleEvent(event),
      onStatus: (status) => {
        this.dispatch({ type: "connection", connection: status });

        if (status === "unavailable") {
          this.dispatch({ type: "phase", phase: "unavailable" });
        }
      },
    });
    this.socket.start();

    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("online", this.onOnline);
  }

  stop(): void {
    if (!this.started) return;

    this.started = false;
    this.generation += 1;

    this.socket?.stop();
    this.socket = null;

    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("online", this.onOnline);

    if (this.readTimer) clearTimeout(this.readTimer);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    for (const timer of this.receiptTimers.values()) clearTimeout(timer);

    this.readTimer = undefined;
    this.refreshTimer = undefined;
    this.receiptTimers.clear();
    this.inFlightSends.clear();
    this.lastReadRequested.clear();
    this.syncing = false;
    this.syncQueued = false;
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState !== "visible") return;

    this.socket?.nudge();
    this.scheduleMarkRead();
  };

  private readonly onOnline = (): void => {
    this.socket?.nudge();
  };

  private isCurrent(generation: number): boolean {
    return this.started && generation === this.generation;
  }

  // --- session + bootstrap --------------------------------------------------

  private async probeSession(): Promise<SessionProbeResult> {
    try {
      await this.api.getChatSession();
      return "ok";
    } catch (error) {
      // 403: this account may not use chat (inactive user/company). A 401
      // that survived the shared refresh means the session is over — the
      // AuthProvider then signs out and discards this store; if it was only
      // a transient refresh failure we simply retry with backoff.
      return chatApi.httpStatusOf(error) === 403 ? "denied" : "retry";
    }
  }

  async loadBootstrap(): Promise<boolean> {
    const generation = this.generation;

    try {
      const data = await this.api.getChatBootstrap();
      if (!this.isCurrent(generation)) return false;

      this.dispatch({ type: "bootstrap", data });
      return true;
    } catch (error) {
      if (!this.isCurrent(generation)) return false;

      if (chatApi.httpStatusOf(error) === 403) {
        this.dispatch({ type: "phase", phase: "unavailable" });
      } else if (this.state.phase !== "ready") {
        this.dispatch({ type: "phase", phase: "error" });
      }

      return false;
    }
  }

  retryBootstrap(): void {
    this.dispatch({ type: "phase", phase: "loading" });
    void this.loadBootstrap();
  }

  /**
   * After every (re)connect: REST is the source of truth. Counters first,
   * then the messages every open thread missed, then receipts, then sends
   * that failed while offline (safe: same clientMessageId => idempotent).
   */
  private async sync(): Promise<void> {
    if (this.syncing) {
      this.syncQueued = true;
      return;
    }

    const generation = this.generation;
    this.syncing = true;

    try {
      do {
        this.syncQueued = false;

        await this.loadBootstrap();

        for (const [conversationId, thread] of Object.entries(
          this.state.threads,
        )) {
          if (!this.isCurrent(generation)) return;

          if (thread.status === "ready") {
            await this.recover(conversationId);
            await this.refreshReceipts(conversationId);
          }
        }

        this.retryFailedSends();
        this.scheduleMarkRead();
      } while (this.syncQueued && this.isCurrent(generation));
    } finally {
      if (this.isCurrent(generation)) this.syncing = false;
    }
  }

  private async recover(conversationId: string): Promise<void> {
    const generation = this.generation;
    let after =
      this.state.threads[conversationId]?.messages.at(-1)?.sequence ?? 0;

    try {
      for (let page = 0; page < MAX_RECOVERY_PAGES; page += 1) {
        const result = await this.api.getChatMessages(conversationId, {
          after,
          limit: RECOVERY_PAGE_SIZE,
        });
        if (!this.isCurrent(generation)) return;

        this.dispatch({
          type: "thread.recovered",
          conversationId,
          messages: result.messages,
        });

        if (!result.hasMore) return;
        after = result.messages.at(-1)?.sequence ?? after;
      }

      // Too far behind to patch: start the thread over from the newest page.
      await this.loadThread(conversationId, { force: true });
    } catch {
      // Best effort: the next reconnect/sync retries.
    }
  }

  // --- real-time events ----------------------------------------------------

  private handleEvent(event: ChatServerEvent): void {
    switch (event.type) {
      case "ready":
        void this.sync();
        break;

      case "message.new": {
        const { message } = event;
        const mine = message.senderId === this.state.me?.id;
        const known = Boolean(this.state.conversations[message.conversationId]);

        this.dispatch({
          type: "message.received",
          message,
          countAsUnread: !mine && !this.isLooking(message.conversationId),
        });

        if (!known) this.scheduleConversationsRefresh();
        if (!mine) {
          this.scheduleMarkRead();
          this.emitActivity("incoming");
        }
        break;
      }

      case "read.updated": {
        if (event.readerId === this.state.me?.id) {
          this.dispatch({
            type: "read.mine",
            conversationId: event.conversationId,
            readSequence: event.upToSequence,
          });

          // Read in ANOTHER tab/device: the unread counter must be re-read.
          // (Echoes of our own acknowledgement are already accounted for.)
          const own = this.lastReadRequested.get(event.conversationId) ?? 0;
          if (event.upToSequence > own) {
            this.scheduleConversationsRefresh();
            this.emitActivity("read");
          }
        } else if (event.conversationType === "DIRECT") {
          this.dispatch({
            type: "read.peer",
            conversationId: event.conversationId,
            upToSequence: event.upToSequence,
          });
        } else {
          this.scheduleReceiptsRefresh(event.conversationId);
        }
        break;
      }

      case "presence.update":
        this.dispatch({
          type: "presence",
          userId: event.userId,
          presence: { online: event.online, lastSeenAt: event.lastSeenAt },
        });
        break;

      default:
        // `pong` / `error`: nothing to do (the server rate-limits and closes
        // abusive sockets itself; REST remains available).
        break;
    }
  }

  // --- threads -------------------------------------------------------------

  async loadThread(
    conversationId: string,
    options: { force?: boolean } = {},
  ): Promise<void> {
    const existing = this.state.threads[conversationId];

    if (
      !options.force &&
      existing &&
      (existing.status === "ready" || existing.status === "loading")
    ) {
      return;
    }

    const generation = this.generation;
    this.dispatch({ type: "thread.loading", conversationId });

    try {
      const page = await this.api.getChatMessages(conversationId, {
        limit: CHAT_HISTORY_PAGE_SIZE,
      });
      if (!this.isCurrent(generation)) return;

      this.dispatch({
        type: "thread.loaded",
        conversationId,
        messages: page.messages,
        hasMore: page.hasMore,
        lastSequence: page.lastSequence,
        readSequence: page.readSequence,
        peerReadSequence: page.peerReadSequence,
      });
      this.scheduleMarkRead();
    } catch {
      if (this.isCurrent(generation)) {
        this.dispatch({ type: "thread.error", conversationId });
      }
    }
  }

  async loadOlder(conversationId: string): Promise<void> {
    const thread = this.state.threads[conversationId];
    const oldest = thread?.messages[0];

    if (!thread || !oldest || !thread.hasMore || thread.loadingOlder) return;

    const generation = this.generation;
    this.dispatch({ type: "thread.older.loading", conversationId });

    try {
      const page = await this.api.getChatMessages(conversationId, {
        before: oldest.sequence,
        limit: CHAT_HISTORY_PAGE_SIZE,
      });
      if (!this.isCurrent(generation)) return;

      this.dispatch({
        type: "thread.older.loaded",
        conversationId,
        messages: page.messages,
        hasMore: page.hasMore,
      });
    } catch {
      if (this.isCurrent(generation)) {
        this.dispatch({ type: "thread.older.failed", conversationId });
      }
    }
  }

  async openDirect(userId: string): Promise<ChatConversation> {
    const generation = this.generation;
    const conversation = await this.api.openDirectConversation(userId);

    if (this.isCurrent(generation)) {
      this.dispatch({ type: "conversation.upsert", conversation });
    }

    return conversation;
  }

  // --- sending -------------------------------------------------------------

  sendMessage(conversationId: string, rawBody: string): SendOutcome {
    const body = normalizeChatBody(rawBody);

    if (!body) return { ok: false, reason: "empty" };
    if (body.length > CHAT_MESSAGE_MAX_LENGTH) {
      return { ok: false, reason: "too_long" };
    }

    const conversation = this.state.conversations[conversationId];
    if (!conversation || !conversation.canSend) {
      return { ok: false, reason: "unavailable" };
    }

    const pending: PendingMessage = {
      clientMessageId: this.newClientMessageId(),
      conversationId,
      body,
      createdAt: new Date().toISOString(),
      status: "sending",
      retryable: true,
    };

    this.dispatch({ type: "pending.add", pending });
    void this.deliver(pending);

    return { ok: true, clientMessageId: pending.clientMessageId };
  }

  retryMessage(conversationId: string, clientMessageId: string): void {
    const pending = this.state.threads[conversationId]?.pending.find(
      (p) => p.clientMessageId === clientMessageId,
    );

    if (!pending || pending.status !== "failed" || !pending.retryable) return;

    this.dispatch({
      type: "pending.update",
      conversationId,
      clientMessageId,
      patch: { status: "sending" },
    });
    void this.deliver({ ...pending, status: "sending" });
  }

  discardMessage(conversationId: string, clientMessageId: string): void {
    this.dispatch({ type: "pending.remove", conversationId, clientMessageId });
  }

  private retryFailedSends(): void {
    for (const [conversationId, thread] of Object.entries(this.state.threads)) {
      for (const pending of thread.pending) {
        if (pending.status === "failed" && pending.retryable) {
          this.retryMessage(conversationId, pending.clientMessageId);
        }
      }
    }
  }

  private async deliver(pending: PendingMessage): Promise<void> {
    const { conversationId, clientMessageId, body } = pending;

    if (this.inFlightSends.has(clientMessageId)) return;
    this.inFlightSends.add(clientMessageId);

    const generation = this.generation;

    try {
      const result = await this.api.sendChatMessage(
        conversationId,
        clientMessageId,
        body,
      );
      if (!this.isCurrent(generation)) return;

      this.dispatch({
        type: "message.received",
        message: result.message,
        countAsUnread: false,
      });
      this.scheduleMarkRead();
    } catch (error) {
      if (!this.isCurrent(generation)) return;

      const retryable = chatApi.isRetryableSendFailure(error);

      this.dispatch({
        type: "pending.update",
        conversationId,
        clientMessageId,
        patch: { status: "failed", retryable },
      });

      // The peer may have left / the chat closed: refresh `canSend`.
      if (!retryable) this.scheduleConversationsRefresh();
    } finally {
      this.inFlightSends.delete(clientMessageId);
    }
  }

  // --- read state ----------------------------------------------------------

  /** The thread the user is actually looking at (page open, tab visible). */
  reportViewport(conversationId: string | null, atBottom: boolean): void {
    const changed =
      this.viewport.conversationId !== conversationId ||
      this.viewport.atBottom !== atBottom;

    this.viewport = { conversationId, atBottom };

    if (changed && conversationId) this.scheduleMarkRead();
  }

  private isLooking(conversationId: string): boolean {
    return (
      this.viewport.conversationId === conversationId &&
      this.viewport.atBottom &&
      document.visibilityState === "visible"
    );
  }

  private scheduleMarkRead(): void {
    if (!this.started || this.readTimer) return;

    this.readTimer = setTimeout(() => {
      this.readTimer = undefined;
      void this.flushRead();
    }, READ_DEBOUNCE_MS);
  }

  private async flushRead(): Promise<void> {
    const conversationId = this.viewport.conversationId;
    if (!conversationId || !this.isLooking(conversationId)) return;

    const thread = this.state.threads[conversationId];
    const conversation = this.state.conversations[conversationId];
    if (!thread || thread.status !== "ready" || !conversation) return;

    const target = thread.messages.at(-1)?.sequence ?? 0;
    const already = Math.max(
      conversation.readSequence,
      this.lastReadRequested.get(conversationId) ?? 0,
    );
    if (target <= already) return;

    const generation = this.generation;
    this.lastReadRequested.set(conversationId, target);

    try {
      const result = await this.api.markChatRead(conversationId, target);
      if (!this.isCurrent(generation)) return;

      this.dispatch({
        type: "read.mine",
        conversationId,
        readSequence: result.readSequence,
        unreadCount: result.unreadCount,
      });
      this.emitActivity("read");
    } catch {
      // Allow the next trigger to try again.
      if (this.lastReadRequested.get(conversationId) === target) {
        this.lastReadRequested.delete(conversationId);
      }
    }
  }

  // --- debounced refreshes ---------------------------------------------------

  private scheduleConversationsRefresh(): void {
    if (!this.started || this.refreshTimer) return;

    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.refreshConversations();
    }, REFRESH_DEBOUNCE_MS);
  }

  private async refreshConversations(): Promise<void> {
    const generation = this.generation;

    try {
      const conversations = await this.api.listChatConversations();

      if (this.isCurrent(generation)) {
        this.dispatch({ type: "conversations", conversations });
      }
    } catch {
      // Counters are re-read on the next event / reconnect.
    }
  }

  private scheduleReceiptsRefresh(conversationId: string): void {
    if (!this.started || !this.state.threads[conversationId]) return;
    if (this.receiptTimers.has(conversationId)) return;

    this.receiptTimers.set(
      conversationId,
      setTimeout(() => {
        this.receiptTimers.delete(conversationId);
        void this.refreshReceipts(conversationId);
      }, RECEIPTS_DEBOUNCE_MS),
    );
  }

  private async refreshReceipts(conversationId: string): Promise<void> {
    const open = (this.state.threads[conversationId]?.messages ?? []).filter(
      (m) =>
        m.receipt &&
        // recipientCount 0 is also what the server answers when its receipt
        // lookup failed right after a send: ask again.
        (m.receipt.readCount < m.receipt.recipientCount ||
          m.receipt.recipientCount === 0),
    );
    if (open.length === 0) return;

    const to = open[open.length - 1].sequence;
    const from = Math.max(1, open[0].sequence, to - RECEIPT_MAX_SPAN);
    const generation = this.generation;

    try {
      const receipts = await this.api.getChatReceipts(conversationId, from, to);

      if (this.isCurrent(generation)) {
        this.dispatch({ type: "receipts", conversationId, receipts });
      }
    } catch {
      // Receipts are cosmetic; they refresh on the next read event.
    }
  }
}
