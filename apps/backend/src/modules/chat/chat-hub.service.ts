import { Injectable, Logger } from '@nestjs/common';

import type { ChatServerEvent, PublishTarget } from './chat.types';

/** One live, authenticated socket as the hub sees it. */
export interface HubConnection {
  id: string;
  userId: string;
  companyId: string;
  send(event: ChatServerEvent): void;
}

/**
 * In-memory registry + fan-out of live connections of THIS process.
 *
 * A connection is only ever addressed through its verified identity
 * (companyId + userId) — there are no client-chosen rooms/subscriptions, so
 * "which events may this socket receive" is decided here, on the server.
 *
 * LIMITATION (documented, not hidden): the registry is per process. With a
 * single API process (the setup this was built and tested for) delivery is
 * complete. If the API is ever run with several instances, publishing must go
 * through a shared bus (e.g. PostgreSQL LISTEN/NOTIFY) — see
 * docs/team-chat/README.md. Nothing here pretends otherwise.
 */
@Injectable()
export class ChatHub {
  private readonly logger = new Logger(ChatHub.name);

  private readonly byCompany = new Map<string, Map<string, HubConnection>>();
  private readonly byId = new Map<string, HubConnection>();

  register(connection: HubConnection): void {
    this.byId.set(connection.id, connection);

    let company = this.byCompany.get(connection.companyId);
    if (!company) {
      company = new Map();
      this.byCompany.set(connection.companyId, company);
    }
    company.set(connection.id, connection);
  }

  unregister(connectionId: string): void {
    const connection = this.byId.get(connectionId);
    if (!connection) return;

    this.byId.delete(connectionId);

    const company = this.byCompany.get(connection.companyId);
    if (company) {
      company.delete(connectionId);
      if (company.size === 0) this.byCompany.delete(connection.companyId);
    }
  }

  get size(): number {
    return this.byId.size;
  }

  all(): HubConnection[] {
    return Array.from(this.byId.values());
  }

  countForUser(userId: string): number {
    let count = 0;
    for (const connection of this.byId.values()) {
      if (connection.userId === userId) count += 1;
    }
    return count;
  }

  /**
   * Delivers `event` to the matching connections of ONE company. Returns the
   * number of sockets it was handed to. A failing socket never prevents
   * delivery to the others.
   */
  publish(target: PublishTarget, event: ChatServerEvent): number {
    const company = this.byCompany.get(target.companyId);
    if (!company) return 0;

    const allowed = target.userIds ? new Set(target.userIds) : null;

    let delivered = 0;

    for (const connection of company.values()) {
      if (allowed && !allowed.has(connection.userId)) continue;

      try {
        connection.send(event);
        delivered += 1;
      } catch {
        this.logger.warn(`Failed to deliver ${event.type} to a connection.`);
      }
    }

    return delivered;
  }
}
