import { createHash } from 'crypto';

import {
  HANDOFF_TOKEN_PATTERN,
  RegionalHandoffService,
} from './regional-handoff.service';
import type { RegionalHints } from './regional-hints';

const hints: RegionalHints = {
  v: 1,
  capturedAt: '2026-11-09T00:00:00.000Z',
  timezone: 'Africa/Cairo',
};

const reference = {
  getCountry: jest.fn((c: string) =>
    Promise.resolve(c === 'EG' ? { code: 'EG' } : null),
  ),
};

function build() {
  const rows = new Map<string, Record<string, unknown>>();
  const prisma = {
    regionalHintHandoff: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(({ data }: { data: { tokenHash: string } }) => {
        rows.set(data.tokenHash, {
          id: `id-${rows.size}`,
          consumedAt: null,
          ...data,
        });
        return Promise.resolve(data);
      }),
    },
  };
  const tx = {
    regionalHintHandoff: {
      findUnique: jest.fn(({ where }: { where: { tokenHash: string } }) =>
        Promise.resolve(rows.get(where.tokenHash) ?? null),
      ),
      updateMany: jest.fn(({ where }: { where: { id: string } }) => {
        const row = [...rows.values()].find((r) => r.id === where.id);
        if (!row || row.consumedAt) return Promise.resolve({ count: 0 });
        row.consumedAt = new Date();
        return Promise.resolve({ count: 1 });
      }),
    },
  };
  return {
    service: new RegionalHandoffService(prisma as never, reference as never),
    prisma,
    tx,
    rows,
  };
}

describe('RegionalHandoffService', () => {
  it('mints an opaque 43-char URL-safe token and stores only its hash', async () => {
    const { service, rows } = build();
    const token = await service.create(hints);

    expect(token).toMatch(HANDOFF_TOKEN_PATTERN);
    const expectedHash = createHash('sha256').update(token).digest('hex');
    expect([...rows.keys()]).toEqual([expectedHash]);
    expect(JSON.stringify([...rows.values()])).not.toContain(token);
  });

  it('tokens are unique and unguessable-looking', async () => {
    const { service } = build();
    const a = await service.create(hints);
    const b = await service.create(hints);
    expect(a).not.toBe(b);
  });

  it('consume returns the hints once (single use)', async () => {
    const { service, tx } = build();
    const token = await service.create(hints);

    const first = await service.consume(tx as never, token);
    expect(first).toMatchObject({ timezone: 'Africa/Cairo' });
    expect(await service.consume(tx as never, token)).toBeNull();
  });

  it('rejects malformed, unknown and expired tokens without touching the DB for malformed ones', async () => {
    const { service, tx } = build();
    expect(await service.consume(tx as never, undefined)).toBeNull();
    expect(await service.consume(tx as never, 'short')).toBeNull();
    expect(
      await service.consume(tx as never, '../'.padEnd(43, 'a')),
    ).toBeNull();
    expect(tx.regionalHintHandoff.findUnique).not.toHaveBeenCalled();

    expect(await service.consume(tx as never, 'b'.repeat(43))).toBeNull();

    const token = await service.create(hints, new Date('2026-01-01T00:00:00Z'));
    expect(
      await service.consume(
        tx as never,
        token,
        new Date('2026-01-01T01:00:00Z'),
      ),
    ).toBeNull();
  });

  it('re-validates the stored document (tampered rows are dropped)', async () => {
    const { service, tx, rows } = build();
    const token = await service.create(hints);
    const row = [...rows.values()][0];
    row.hints = { v: 1, timezone: 'Mars/Base', ipCountry: 'ZZ', latitude: 1 };

    expect(await service.consume(tx as never, token)).toBeNull();
  });

  it('cleans expired rows opportunistically', async () => {
    const { service, prisma } = build();
    await service.create(hints);
    expect(prisma.regionalHintHandoff.deleteMany).toHaveBeenCalled();
  });
});
