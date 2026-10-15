/* eslint-disable @typescript-eslint/unbound-method -- jest.fn() send handlers are asserted through detached references */
import { ChatHub } from './chat-hub.service';
import type { HubConnection } from './chat-hub.service';
import type { ChatServerEvent } from './chat.types';

const event: ChatServerEvent = { type: 'pong', serverTime: 't' };

function connection(
  id: string,
  userId: string,
  companyId: string,
  send: jest.Mock = jest.fn(),
): HubConnection & { send: jest.Mock } {
  return { id, userId, companyId, send };
}

describe('ChatHub', () => {
  let hub: ChatHub;

  beforeEach(() => {
    hub = new ChatHub();
  });

  it('delivers company-wide events only to that company', () => {
    const a1 = connection('1', 'u1', 'A');
    const a2 = connection('2', 'u2', 'A');
    const b1 = connection('3', 'u3', 'B');
    [a1, a2, b1].forEach((c) => hub.register(c));

    expect(hub.publish({ companyId: 'A' }, event)).toBe(2);

    expect(a1.send).toHaveBeenCalledWith(event);
    expect(a2.send).toHaveBeenCalledWith(event);
    expect(b1.send).not.toHaveBeenCalled();
  });

  it('never delivers to a user of another company, even if the user id is listed', () => {
    const intruder = connection('1', 'u1', 'B');
    hub.register(intruder);

    expect(hub.publish({ companyId: 'A', userIds: ['u1'] }, event)).toBe(0);
    expect(intruder.send).not.toHaveBeenCalled();
  });

  it('narrows delivery to the listed users, across all their connections', () => {
    const tab1 = connection('1', 'u1', 'A');
    const tab2 = connection('2', 'u1', 'A');
    const other = connection('3', 'u2', 'A');
    [tab1, tab2, other].forEach((c) => hub.register(c));

    expect(hub.publish({ companyId: 'A', userIds: ['u1'] }, event)).toBe(2);
    expect(other.send).not.toHaveBeenCalled();
  });

  it('an empty recipient list delivers to nobody (not to everybody)', () => {
    const c = connection('1', 'u1', 'A');
    hub.register(c);

    expect(hub.publish({ companyId: 'A', userIds: [] }, event)).toBe(0);
    expect(c.send).not.toHaveBeenCalled();
  });

  it('a throwing socket does not block the others', () => {
    const bad = connection(
      '1',
      'u1',
      'A',
      jest.fn(() => {
        throw new Error('closed');
      }),
    );
    const good = connection('2', 'u2', 'A');
    [bad, good].forEach((c) => hub.register(c));

    expect(hub.publish({ companyId: 'A' }, event)).toBe(1);
    expect(good.send).toHaveBeenCalledTimes(1);
  });

  it('unregister removes the connection and empties the company bucket', () => {
    const c = connection('1', 'u1', 'A');
    hub.register(c);
    expect(hub.size).toBe(1);
    expect(hub.countForUser('u1')).toBe(1);

    hub.unregister('1');
    hub.unregister('does-not-exist'); // idempotent

    expect(hub.size).toBe(0);
    expect(hub.countForUser('u1')).toBe(0);
    expect(hub.publish({ companyId: 'A' }, event)).toBe(0);
  });

  it('counts connections per user', () => {
    hub.register(connection('1', 'u1', 'A'));
    hub.register(connection('2', 'u1', 'A'));
    hub.register(connection('3', 'u2', 'A'));

    expect(hub.countForUser('u1')).toBe(2);
    expect(hub.all()).toHaveLength(3);
  });
});
