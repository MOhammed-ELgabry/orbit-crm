import { ForbiddenException, Inject, Injectable } from '@nestjs/common';

import { CHAT_REPOSITORY } from './chat.constants';
import type { IChatRepository } from './chat.repository.interface';
import type { ChatActor } from './chat.types';

/**
 * Chat-specific authorization layer.
 *
 * Deliberately independent of RBAC: there is no `chat:*` permission and
 * nothing here reads or changes roles/permissions. A caller is eligible iff,
 * RIGHT NOW in the database,
 *   - the user exists, is active and not soft-deleted,
 *   - the user belongs to a company (companyId from the DB row, never from
 *     a token claim — a token can be older than a company move), and
 *   - that company is active and not soft-deleted.
 * Every chat operation (REST and the socket's periodic revalidation) goes
 * through this check, so a state change takes effect on the next call.
 */
@Injectable()
export class ChatEligibilityService {
  constructor(
    @Inject(CHAT_REPOSITORY) private readonly repository: IChatRepository,
  ) {}

  /** Returns the caller's current identity or rejects with a uniform 403. */
  async requireActor(userId: string | undefined): Promise<ChatActor> {
    const actor = userId ? await this.findActor(userId) : null;

    if (!actor) {
      throw new ForbiddenException('Chat is not available for this account.');
    }

    return actor;
  }

  async findActor(userId: string): Promise<ChatActor | null> {
    const row = await this.repository.findActor(userId);

    if (!row) return null;

    return {
      userId: row.id,
      companyId: row.companyId,
      firstName: row.firstName,
      lastName: row.lastName,
      avatar: row.avatar,
      roleName: row.roleName,
    };
  }
}
