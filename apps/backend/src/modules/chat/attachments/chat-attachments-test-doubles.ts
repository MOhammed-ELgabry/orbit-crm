/**
 * Test doubles shared by the attachment unit specs. NOTHING here talks to a
 * database or a server: the in-memory repository mirrors what the SQL
 * statements are written to do, so the application logic around them can be
 * tested. The SQL itself (locks, triggers, constraints) needs PostgreSQL and
 * is NOT covered by these doubles.
 */
import { ChatEligibilityService } from '../chat-eligibility.service';
import { ChatHub } from '../chat-hub.service';
import type {
  ChatConversationRow,
  IChatRepository,
} from '../chat.repository.interface';
import { ChatService } from '../chat.service';

import type {
  AttachmentRow,
  IChatAttachmentsRepository,
  ReserveAttachmentInput,
  ReserveAttachmentResult,
} from './chat-attachments.repository';

export const COMPANY = 'company-a';
export const OTHER_COMPANY = 'company-b';
export const NOW = new Date('2026-11-01T10:00:00.000Z');

export const directConversation = (
  overrides: Partial<ChatConversationRow> = {},
): ChatConversationRow => ({
  id: 'dm-1',
  companyId: COMPANY,
  type: 'DIRECT',
  conversationKey: 'DIRECT:2:u1:2:u2',
  directUserLowKey: 'u1',
  directUserHighKey: 'u2',
  nextSequence: 0,
  updatedAt: NOW,
  ...overrides,
});

export const teamConversation = (): ChatConversationRow => ({
  id: 'team-1',
  companyId: COMPANY,
  type: 'TEAM',
  conversationKey: 'TEAM',
  directUserLowKey: null,
  directUserHighKey: null,
  nextSequence: 0,
  updatedAt: NOW,
});

export function attachmentRow(
  overrides: Partial<AttachmentRow> = {},
): AttachmentRow {
  return {
    id: 'att-1',
    companyId: COMPANY,
    conversationId: 'dm-1',
    messageId: null,
    uploaderKey: 'u1',
    status: 'READY',
    kind: 'IMAGE',
    contentType: 'image/png',
    displayName: 'photo.png',
    sizeBytes: 100,
    sha256: 'a'.repeat(64),
    width: 4,
    height: 3,
    storageKey: `${COMPANY}/ab/token-1`,
    createdAt: new Date(Date.now() - 1000),
    readyAt: new Date(Date.now() - 500),
    attachedAt: null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    ...overrides,
  };
}

/** In-memory stand-in for ChatAttachmentsRepository (same scoping rules). */
export class FakeAttachmentsRepository implements IChatAttachmentsRepository {
  rows = new Map<string, AttachmentRow>();
  private counter = 0;
  /** Set to make `markReady` lose the race against the sweeper. */
  failMarkReady = false;

  add(row: AttachmentRow): AttachmentRow {
    this.rows.set(row.id, row);
    return row;
  }

  private live(row: AttachmentRow): boolean {
    return (
      ['UPLOADING', 'READY'].includes(row.status) &&
      !!row.expiresAt &&
      row.expiresAt.getTime() > Date.now()
    );
  }

  private counted(row: AttachmentRow): boolean {
    return row.status === 'ATTACHED' || this.live(row);
  }

  countPendingForUser(uploaderKey: string, companyId: string) {
    return Promise.resolve(
      [...this.rows.values()].filter(
        (r) =>
          r.uploaderKey === uploaderKey &&
          r.companyId === companyId &&
          this.live(r),
      ).length,
    );
  }

  countRecentForUser(uploaderKey: string, companyId: string) {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    return Promise.resolve(
      [...this.rows.values()].filter(
        (r) =>
          r.uploaderKey === uploaderKey &&
          r.companyId === companyId &&
          r.createdAt.getTime() > since,
      ).length,
    );
  }

  usedBytes(companyId?: string) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter(
          (r) => this.counted(r) && (!companyId || r.companyId === companyId),
        )
        .reduce((sum, r) => sum + r.sizeBytes, 0),
    );
  }

  async reserve(
    input: ReserveAttachmentInput,
  ): Promise<ReserveAttachmentResult> {
    if (
      (await this.countPendingForUser(input.uploaderKey, input.companyId)) >=
      input.maxPendingPerUser
    ) {
      return { ok: false, reason: 'pending_limit' };
    }

    if (
      (await this.countRecentForUser(input.uploaderKey, input.companyId)) >=
      input.maxDailyPerUser
    ) {
      return { ok: false, reason: 'daily_limit' };
    }

    if (
      (await this.usedBytes(input.companyId)) + input.sizeBytes >
      input.companyQuotaBytes
    ) {
      return { ok: false, reason: 'company_quota' };
    }

    if ((await this.usedBytes()) + input.sizeBytes > input.globalQuotaBytes) {
      return { ok: false, reason: 'global_quota' };
    }

    this.counter += 1;

    const row: AttachmentRow = {
      id: `att-new-${this.counter}`,
      companyId: input.companyId,
      conversationId: input.conversationId,
      messageId: null,
      uploaderKey: input.uploaderKey,
      status: 'UPLOADING',
      kind: input.kind,
      contentType: input.contentType,
      displayName: input.displayName,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      width: input.width,
      height: input.height,
      storageKey: input.storageKey,
      createdAt: new Date(),
      readyAt: null,
      attachedAt: null,
      expiresAt: new Date(Date.now() + input.uploadingTtlMs),
    };

    this.rows.set(row.id, row);

    return { ok: true, row };
  }

  markReady(id: string, companyId: string, readyTtlMs: number) {
    const row = this.rows.get(id);

    if (
      this.failMarkReady ||
      !row ||
      row.companyId !== companyId ||
      row.status !== 'UPLOADING'
    ) {
      return Promise.resolve(null);
    }

    const next = {
      ...row,
      status: 'READY' as const,
      readyAt: new Date(),
      expiresAt: new Date(Date.now() + readyTtlMs),
    };

    this.rows.set(id, next);
    return Promise.resolve(next);
  }

  findInConversation(id: string, conversationId: string, companyId: string) {
    const row = this.rows.get(id);

    return Promise.resolve(
      row &&
        row.conversationId === conversationId &&
        row.companyId === companyId
        ? row
        : null,
    );
  }

  findByMessageIds(companyId: string, messageIds: string[]) {
    return Promise.resolve(
      [...this.rows.values()].filter(
        (r) =>
          r.companyId === companyId &&
          r.status === 'ATTACHED' &&
          r.messageId !== null &&
          messageIds.includes(r.messageId),
      ),
    );
  }

  expireOwned(id: string, uploaderKey: string, companyId: string) {
    const row = this.rows.get(id);

    if (
      !row ||
      row.uploaderKey !== uploaderKey ||
      row.companyId !== companyId ||
      !['UPLOADING', 'READY'].includes(row.status)
    ) {
      return Promise.resolve(null);
    }

    const next = { ...row, status: 'EXPIRED' as const, expiresAt: new Date() };
    this.rows.set(id, next);
    return Promise.resolve(next);
  }

  expireAny(id: string, companyId: string) {
    const row = this.rows.get(id);

    if (
      row &&
      row.companyId === companyId &&
      ['UPLOADING', 'READY'].includes(row.status)
    ) {
      this.rows.set(id, { ...row, status: 'EXPIRED', expiresAt: new Date() });
    }

    return Promise.resolve();
  }

  claimExpired(limit: number, graceMs: number) {
    const cutoff = Date.now() - graceMs;
    const claimed: AttachmentRow[] = [];

    for (const row of this.rows.values()) {
      if (claimed.length >= limit) break;

      if (
        ['UPLOADING', 'READY'].includes(row.status) &&
        row.expiresAt &&
        row.expiresAt.getTime() < cutoff
      ) {
        const next = { ...row, status: 'EXPIRED' as const };
        this.rows.set(row.id, next);
        claimed.push(next);
      }
    }

    return Promise.resolve(claimed);
  }

  findOldExpired(retentionMs: number, limit: number) {
    const cutoff = Date.now() - retentionMs;

    return Promise.resolve(
      [...this.rows.values()]
        .filter(
          (r) =>
            r.status === 'EXPIRED' &&
            r.expiresAt &&
            r.expiresAt.getTime() < cutoff,
        )
        .slice(0, limit),
    );
  }

  deleteExpiredRows(ids: string[]) {
    let deleted = 0;

    for (const id of ids) {
      const row = this.rows.get(id);

      if (row && row.status === 'EXPIRED' && row.messageId === null) {
        this.rows.delete(id);
        deleted += 1;
      }
    }

    return Promise.resolve(deleted);
  }
}

/** Minimal chat repository: enough for the REAL authorize()/requireActor(). */
export function makeChatRepositoryStub(conversations: ChatConversationRow[]) {
  const byId = new Map(conversations.map((c) => [c.id, c]));

  const repo = {
    findActor: jest.fn((id: string) =>
      Promise.resolve({
        id,
        companyId: id.startsWith('x') ? OTHER_COMPANY : COMPANY,
        firstName: 'User',
        lastName: id,
        avatar: null,
        roleName: 'Agent',
      }),
    ),
    findConversationById: jest.fn((id: string) =>
      Promise.resolve(byId.get(id) ?? null),
    ),
    isParticipant: jest.fn(() => Promise.resolve(true)),
    findPeers: jest.fn((_company: string, ids: string[]) =>
      Promise.resolve(
        ids.map((id) => ({
          id,
          firstName: 'Peer',
          lastName: id,
          avatar: null,
          roleName: null,
          eligible: true,
          exists: true,
        })),
      ),
    ),
    findMessageByClientId: jest.fn(() => Promise.resolve(null)),
    insertMessage: jest.fn(),
    getRoleNames: jest.fn(() => Promise.resolve(new Map())),
    getAvatars: jest.fn(() => Promise.resolve(new Map())),
    getParticipantReadSequences: jest.fn(() => Promise.resolve(new Map())),
    getTeamCursors: jest.fn(() => Promise.resolve(new Map())),
    getCurrentMembers: jest.fn(() => Promise.resolve([])),
    getAudienceMembers: jest.fn(() => Promise.resolve([])),
  };

  return repo as unknown as jest.Mocked<IChatRepository> & typeof repo;
}

/** The REAL ChatService (unchanged authorization) over a stub repository. */
export function makeRealChat(repo: IChatRepository) {
  const hub = new ChatHub();
  const notifications = {
    publishChatMessage: jest.fn().mockResolvedValue({ notifiedUserIds: [] }),
    markChatConversationRead: jest.fn().mockResolvedValue({ updated: 0 }),
  };
  const presence = { getPresence: jest.fn().mockResolvedValue(new Map()) };

  const eligibility = new ChatEligibilityService(repo);

  const chat = new ChatService(
    repo,
    eligibility,
    hub,
    presence as never,
    notifications as never,
  );

  return { chat, eligibility, hub, notifications };
}
