/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- jest mock call records are untyped (`any`) by design */
import {
  auditCreate,
  auditDelete,
  auditUpdate,
  AuditWriteFailedException,
  writeAuditEntry,
  type AuditTx,
} from './audit.writer';
import type { AuditActor, AuditEntryInput } from './audit.types';

const actor: AuditActor = {
  actorUserId: 'actor-1',
  ipAddress: '10.0.0.1',
  userAgent: 'jest',
};

function makeTx(create = jest.fn().mockResolvedValue({})) {
  return { tx: { auditLog: { create } } as unknown as AuditTx, create };
}

const entry = (over: Partial<AuditEntryInput> = {}): AuditEntryInput => ({
  companyId: 'company-1',
  actorUserId: 'actor-1',
  action: 'create',
  entityType: 'contact',
  entityId: 'e1',
  entityLabel: 'Mona Ali',
  changes: null,
  metadata: null,
  correlationId: null,
  ipAddress: null,
  userAgent: null,
  ...over,
});

describe('audit writer', () => {
  it('writes the row with the company, actor and request metadata', async () => {
    const { tx, create } = makeTx();

    await auditCreate(
      tx,
      'contact',
      'company-1',
      { ...actor, correlationId: 'corr-1', metadata: { source: 'import' } },
      { id: 'c1', firstName: 'Mona', lastName: 'Ali', status: 'active' },
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toEqual({
      companyId: 'company-1',
      actorUserId: 'actor-1',
      action: 'create',
      entityType: 'contact',
      entityId: 'c1',
      entityLabel: 'Mona Ali',
      changes: { status: { old: null, new: 'active' } },
      metadata: { source: 'import' },
      correlationId: 'corr-1',
      ipAddress: '10.0.0.1',
      userAgent: 'jest',
    });
  });

  it('never persists secrets or personal values of the record', async () => {
    const { tx, create } = makeTx();

    await auditUpdate(
      tx,
      'user',
      'company-1',
      actor,
      { id: 'u1', isActive: true, passwordHash: 'old-hash', phone: '1' },
      { id: 'u1', isActive: false, passwordHash: 'new-hash', phone: '2' },
    );

    const serialized = JSON.stringify(create.mock.calls[0][0].data);
    expect(serialized).not.toContain('hash');
    expect(serialized).toContain('"phone":{"changed":true}');
  });

  it('auditUpdate writes nothing and returns false for a no-op update', async () => {
    const { tx, create } = makeTx();

    const written = await auditUpdate(
      tx,
      'contact',
      'company-1',
      actor,
      { id: 'c1', status: 'active' },
      { id: 'c1', status: 'active' },
    );

    expect(written).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('auditUpdate merges extra changes (role permissions diff)', async () => {
    const { tx, create } = makeTx();

    await auditUpdate(
      tx,
      'role',
      'company-1',
      actor,
      { id: 'r1', name: 'A', description: null },
      { id: 'r1', name: 'A', description: null },
      {
        extraChanges: {
          permissions: { added: ['contact:read'], removed: [] },
        },
      },
    );

    expect(create.mock.calls[0][0].data.changes).toEqual({
      permissions: { added: ['contact:read'], removed: [] },
    });
  });

  it('auditDelete records the deletion with the label and no values', async () => {
    const { tx, create } = makeTx();

    await auditDelete(tx, 'lead', 'company-1', actor, {
      id: 'l1',
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.c',
    });

    const data = create.mock.calls[0][0].data;
    expect(data.action).toBe('delete');
    expect(data.entityLabel).toBe('A B');
    expect(data.changes).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain('a@b.c');
  });

  it('clips oversized request metadata and label', async () => {
    const { tx, create } = makeTx();

    await writeAuditEntry(
      tx,
      entry({
        entityLabel: 'l'.repeat(500),
        userAgent: 'u'.repeat(500),
        ipAddress: 'i'.repeat(500),
      }),
    );

    const data = create.mock.calls[0][0].data;
    expect(data.entityLabel).toHaveLength(120);
    expect(data.userAgent).toHaveLength(200);
    expect(data.ipAddress).toHaveLength(64);
  });

  it('turns ANY write failure into AuditWriteFailedException (never swallowed)', async () => {
    const { tx } = makeTx(
      jest.fn().mockRejectedValue(new Error('secret connection detail')),
    );

    const failure = writeAuditEntry(tx, entry());

    await expect(failure).rejects.toBeInstanceOf(AuditWriteFailedException);
    await expect(failure).rejects.toMatchObject({
      message: 'Audit record could not be written.',
    });
    await expect(failure).rejects.not.toMatchObject({
      message: expect.stringContaining('secret') as string,
    });
  });

  it('refuses an entry without a company', async () => {
    const { tx, create } = makeTx();

    await expect(
      writeAuditEntry(tx, entry({ companyId: '' })),
    ).rejects.toBeInstanceOf(AuditWriteFailedException);
    expect(create).not.toHaveBeenCalled();
  });
});
