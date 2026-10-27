import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { UserAvatarService, validateAvatarUpload } from './avatar.service';

function png(width = 64, height = 64): Buffer {
  const buf = Buffer.alloc(40);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

const file = (buffer: Buffer) => ({ buffer, size: buffer.length });

function makePrisma() {
  const prisma = {
    user: {
      findFirst: jest.fn(),
      update: jest.fn((args: unknown) => ({ op: 'user.update', args })),
    },
    userAvatar: {
      upsert: jest.fn((args: unknown) => ({ op: 'avatar.upsert', args })),
      deleteMany: jest.fn((args: unknown) => ({
        op: 'avatar.deleteMany',
        args,
      })),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.resolve(ops)),
  };
  return prisma;
}

describe('UserAvatarService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: UserAvatarService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new UserAvatarService(prisma as never);
    prisma.user.findFirst.mockResolvedValue({ id: 'u1' });
  });

  describe('setOwn', () => {
    it('stores the picture and the reference to it in one transaction', async () => {
      const result = await service.setOwn('u1', 'u1', 'c1', file(png()));

      expect(result.avatar).toMatch(/^\/users\/u1\/avatar\?v=[0-9a-f]{16}$/);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.userAvatar.upsert.mock.calls[0][0]).toMatchObject({
        where: { userId: 'u1' },
        create: { userId: 'u1', contentType: 'image/png' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { avatar: result.avatar },
      });
    });

    it("refuses to change another user's picture (same company) before touching the database", async () => {
      await expect(
        service.setOwn('someone-else', 'u1', 'c1', file(png())),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('gives a probed id that does not exist the same 403', async () => {
      await expect(
        service.setOwn('nope', 'u1', 'c1', file(png())),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("looks the user up inside the caller's own company only", async () => {
      await service.setOwn('u1', 'u1', 'c1', file(png()));

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'u1', companyId: 'c1', deletedAt: null },
        select: { id: true },
      });
    });

    it("404s when the caller's user is not in that company / is deleted", async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.setOwn('u1', 'u1', 'c1', file(png())),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['no file', undefined],
      [
        'an SVG',
        file(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
      ],
      ['an executable', file(Buffer.from('MZ\x90\x00\x03', 'binary'))],
      ['an empty file', file(Buffer.alloc(0))],
      ['a 600 KB file', file(Buffer.concat([png(), Buffer.alloc(600 * 1024)]))],
    ])('rejects %s and writes nothing', async (_name, upload) => {
      await expect(
        service.setOwn('u1', 'u1', 'c1', upload),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('gives a different reference for a different picture', async () => {
      const a = await service.setOwn('u1', 'u1', 'c1', file(png(64, 64)));
      const b = await service.setOwn('u1', 'u1', 'c1', file(png(65, 64)));

      expect(a.avatar).not.toBe(b.avatar);
    });
  });

  describe('removeOwn', () => {
    it('deletes the picture and clears the reference together', async () => {
      await expect(service.removeOwn('u1', 'u1', 'c1')).resolves.toEqual({
        avatar: null,
      });

      expect(prisma.userAvatar.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { avatar: null },
      });
    });

    it("refuses to remove another user's picture", async () => {
      await expect(
        service.removeOwn('someone-else', 'u1', 'c1'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('readForCompany (tenant isolation)', () => {
    it("only matches a picture whose owner is in the caller's company", async () => {
      prisma.userAvatar.findFirst.mockResolvedValue({
        data: new Uint8Array([1, 2, 3]),
        contentType: 'image/png',
        checksum: 'abc',
        size: 3,
      });

      const result = await service.readForCompany('u2', 'c1');

      expect(prisma.userAvatar.findFirst).toHaveBeenCalledWith({
        where: { userId: 'u2', user: { companyId: 'c1', deletedAt: null } },
        select: {
          data: true,
          contentType: true,
          checksum: true,
          size: true,
        },
      });
      expect(Buffer.isBuffer(result.data)).toBe(true);
      expect([...result.data]).toEqual([1, 2, 3]);
    });

    it("404s for another company's user, a deleted user or no picture alike", async () => {
      prisma.userAvatar.findFirst.mockResolvedValue(null);

      await expect(
        service.readForCompany('other-company-user', 'c1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

describe('validateAvatarUpload', () => {
  it('returns a SHA-256 of the exact bytes', () => {
    const a = validateAvatarUpload(file(png(10, 10)));
    const b = validateAvatarUpload(file(png(10, 10)));
    const c = validateAvatarUpload(file(png(11, 10)));

    expect(a.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(a.checksum).toBe(b.checksum);
    expect(a.checksum).not.toBe(c.checksum);
  });
});
