/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- jest mock call records are untyped (`any`) by design */
import { NotFoundException } from '@nestjs/common';

import { CompanyRepository } from './company.repository';
import { AuditWriteFailedException } from '../../audit/audit.writer';
import type { AuditActor } from '../../audit/audit.types';

const audit: AuditActor = { actorUserId: 'owner-1' };
const id = 'company-A';

const company = (overrides: Record<string, unknown> = {}) => ({
  id,
  name: 'Acme Clinic',
  contactEmail: 'old@acme.test',
  phone: '+201000000000',
  address: 'Secret street 1',
  isActive: true,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

function makeMocks() {
  const tx = {
    company: {
      findUnique: jest.fn().mockResolvedValue(company()),
      update: jest.fn().mockResolvedValue(company()),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };

  return { tx, repository: new CompanyRepository(prisma as never) };
}

describe('CompanyRepository audit', () => {
  it('update(): records the company event under the company itself, masking contact data', async () => {
    const { tx, repository } = makeMocks();
    tx.company.update.mockResolvedValue(
      company({
        name: 'Acme Dental',
        contactEmail: 'new@acme.test',
        address: 'Another secret street',
      }),
    );

    await repository.update(id, { name: 'Acme Dental' }, audit);

    const { data } = tx.auditLog.create.mock.calls[0][0];
    expect(data.companyId).toBe(id);
    expect(data.action).toBe('update');
    expect(data.entityType).toBe('company');
    expect(data.changes.name).toEqual({
      old: 'Acme Clinic',
      new: 'Acme Dental',
    });
    expect(data.changes.contactEmail).toEqual({ changed: true });
    expect(data.changes.address).toEqual({ changed: true });

    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain('old@acme.test');
    expect(serialized).not.toContain('new@acme.test');
    expect(serialized).not.toContain('secret street');
  });

  it('update(): a no-op update writes no audit row', async () => {
    const { tx, repository } = makeMocks();

    await repository.update(id, { name: 'Acme Clinic' }, audit);

    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('update(): 404 and no audit row for a missing company', async () => {
    const { tx, repository } = makeMocks();
    tx.company.findUnique.mockResolvedValue(null);

    await expect(repository.update(id, {}, audit)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('delete(): soft-deletes and records company.delete in the same transaction', async () => {
    const { tx, repository } = makeMocks();

    await repository.delete(id, audit);

    expect(tx.company.update).toHaveBeenCalledWith({
      where: { id },
      data: { deletedAt: expect.any(Date) },
    });
    const { data } = tx.auditLog.create.mock.calls[0][0];
    expect(data).toEqual(
      expect.objectContaining({
        companyId: id,
        action: 'delete',
        entityType: 'company',
        entityId: id,
      }),
    );
  });

  it('delete(): rejects when the audit row cannot be written', async () => {
    const { tx, repository } = makeMocks();
    tx.auditLog.create.mockRejectedValueOnce(new Error('down'));

    await expect(repository.delete(id, audit)).rejects.toBeInstanceOf(
      AuditWriteFailedException,
    );
  });
});
