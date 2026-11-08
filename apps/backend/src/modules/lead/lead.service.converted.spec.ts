import { ConflictException, NotFoundException } from '@nestjs/common';

import { LeadService } from './lead.service';

const audit = { actorUserId: 'a1' };

const makeService = (lead: Record<string, unknown> | null) => {
  const repo = {
    findById: jest.fn().mockResolvedValue(lead),
    update: jest.fn().mockResolvedValue(lead),
    softDelete: jest.fn().mockResolvedValue(true),
  };
  const service = new LeadService(
    repo as never,
    { findById: jest.fn() } as never,
    { publish: jest.fn() } as never,
  );
  return { repo, service };
};

describe('LeadService — converted leads are locked', () => {
  const converted = { id: 'l1', status: 'converted', convertedAt: new Date() };

  it('update() refuses a converted lead with 409 and writes nothing', async () => {
    const { repo, service } = makeService(converted);
    await expect(
      service.update('c1', 'l1', { notes: 'x' }, 'u1', audit),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('remove() refuses a converted lead with 409 and deletes nothing', async () => {
    const { repo, service } = makeService(converted);
    await expect(service.remove('c1', 'l1', audit)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it('remove() of a missing lead is still a 404', async () => {
    const { repo, service } = makeService(null);
    await expect(service.remove('c1', 'l1', audit)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it('remove() of an ordinary lead still deletes it', async () => {
    const { repo, service } = makeService({
      id: 'l1',
      status: 'new',
      convertedAt: null,
    });
    await service.remove('c1', 'l1', audit);
    expect(repo.softDelete).toHaveBeenCalledWith('c1', 'l1', audit);
  });
});
