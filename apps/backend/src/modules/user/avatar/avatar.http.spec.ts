/**
 * HTTP-level checks for the picture endpoints: the real UserController, the
 * real CsrfGuard, the real multer upload interceptor, the real global
 * ValidationPipe and ResponseInterceptor, and the real UserAvatarService on a
 * fake Prisma. Authentication is replaced by a guard that stamps `req.user`
 * from a test header (JwtAuthGuard has its own tests).
 */
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import type { Server } from 'http';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { HttpExceptionFilter } from '../../../common/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../common/interceptors/response.interceptor';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UserController } from '../user.controller';
import { UserService } from '../user.service';

import { AVATAR_MAX_BYTES } from './avatar.constants';
import { UserAvatarService } from './avatar.service';

function png(extra = 0): Buffer {
  const buf = Buffer.alloc(40 + extra);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(64, 16);
  buf.writeUInt32BE(64, 20);
  return buf;
}

/** Test-only stand-in for JwtAuthGuard: "x-test-user: id,companyId". */
class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: unknown }>();
    const header = req.headers['x-test-user'] as string | undefined;
    if (!header) return false;
    const [sub, companyId] = header.split(',');
    req.user = { sub, companyId, email: `${sub}@x.test`, isOwner: false };
    return true;
  }
}

const CSRF = 'csrf-token-value';
const asUser = (r: request.Test, id = 'u1', company = 'c1') =>
  r.set('x-test-user', `${id},${company}`);
const withCsrf = (r: request.Test) =>
  r.set('Cookie', `orbit_csrf_token=${CSRF}`).set('x-csrf-token', CSRF);

describe('profile picture endpoints (HTTP)', () => {
  let app: INestApplication;
  let server: Server;
  const prisma = {
    user: {
      findFirst: jest.fn(),
      update: jest.fn((args: unknown) => args),
    },
    userAvatar: {
      upsert: jest.fn((args: unknown) => args),
      deleteMany: jest.fn((args: unknown) => args),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.resolve(ops)),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        UserAvatarService,
        { provide: UserService, useValue: {} },
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(FakeAuthGuard)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.use(cookieParser());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findFirst.mockResolvedValue({ id: 'u1' });
  });

  describe('PUT /users/:id/avatar', () => {
    it('stores a valid PNG for the signed-in user', async () => {
      const res = await withCsrf(
        asUser(request(server).put('/users/u1/avatar')),
      ).attach('avatar', png(), {
        filename: 'me.png',
        contentType: 'image/png',
      });

      expect(res.status).toBe(200);
      expect(
        (res.body as { data: { avatar: string | null } }).data.avatar,
      ).toMatch(/^\/users\/u1\/avatar\?v=[0-9a-f]{16}$/);
      expect(prisma.userAvatar.upsert).toHaveBeenCalledTimes(1);
    });

    it('rejects an upload without the CSRF header, before saving anything', async () => {
      const res = await asUser(request(server).put('/users/u1/avatar'))
        .set('Cookie', `orbit_csrf_token=${CSRF}`)
        .attach('avatar', png(), { filename: 'me.png' });

      expect(res.status).toBe(403);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an unauthenticated upload', async () => {
      const res = await withCsrf(
        request(server).put('/users/u1/avatar'),
      ).attach('avatar', png(), { filename: 'me.png' });

      expect(res.status).toBe(403);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("cannot change another user's picture, even in the same company", async () => {
      const res = await withCsrf(
        asUser(request(server).put('/users/u2/avatar'), 'u1', 'c1'),
      ).attach('avatar', png(), { filename: 'me.png' });

      expect(res.status).toBe(403);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a text file renamed to .png (content decides, not the name or MIME type)', async () => {
      const res = await withCsrf(
        asUser(request(server).put('/users/u1/avatar')),
      ).attach('avatar', Buffer.from('<script>alert(1)</script>'), {
        filename: 'evil.png',
        contentType: 'image/png',
      });

      expect(res.status).toBe(400);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an SVG', async () => {
      const res = await withCsrf(
        asUser(request(server).put('/users/u1/avatar')),
      ).attach(
        'avatar',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        {
          filename: 'a.svg',
          contentType: 'image/svg+xml',
        },
      );

      expect(res.status).toBe(400);
    });

    it('rejects a file over the size limit with 413 and saves nothing', async () => {
      const res = await withCsrf(
        asUser(request(server).put('/users/u1/avatar')),
      ).attach('avatar', png(AVATAR_MAX_BYTES), {
        filename: 'big.png',
        contentType: 'image/png',
      });

      expect(res.status).toBe(413);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a request with no file', async () => {
      const res = await withCsrf(
        asUser(request(server).put('/users/u1/avatar')),
      ).send({});

      expect(res.status).toBe(400);
    });

    it('rejects a picture sent under the wrong field name', async () => {
      const res = await withCsrf(
        asUser(request(server).put('/users/u1/avatar')),
      ).attach('file', png(), { filename: 'me.png' });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /users/:id/avatar', () => {
    it("removes the signed-in user's own picture", async () => {
      const res = await withCsrf(
        asUser(request(server).delete('/users/u1/avatar')),
      );

      expect(res.status).toBe(200);
      expect(
        (res.body as { data: { avatar: string | null } }).data.avatar,
      ).toBeNull();
    });

    it('requires CSRF', async () => {
      const res = await asUser(request(server).delete('/users/u1/avatar'));

      expect(res.status).toBe(403);
    });

    it("cannot remove another user's picture", async () => {
      const res = await withCsrf(
        asUser(request(server).delete('/users/u2/avatar')),
      );

      expect(res.status).toBe(403);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('GET /users/:id/avatar', () => {
    const stored = () => ({
      data: png(),
      contentType: 'image/png',
      checksum: 'f'.repeat(64),
      size: 40,
    });

    it('serves the raw image (no JSON envelope) with safe headers', async () => {
      prisma.userAvatar.findFirst.mockResolvedValue(stored());

      const res = await asUser(request(server).get('/users/u2/avatar')).buffer(
        true,
      );

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain(
        "default-src 'none'",
      );
      expect(res.headers['cache-control']).toContain('private');
      expect(res.headers.etag).toBe(`"${'f'.repeat(64)}"`);
      expect(Buffer.from(res.body as Buffer).equals(png())).toBe(true);
    });

    it('answers 304 when the picture has not changed', async () => {
      prisma.userAvatar.findFirst.mockResolvedValue(stored());

      const res = await asUser(request(server).get('/users/u2/avatar')).set(
        'If-None-Match',
        `"${'f'.repeat(64)}"`,
      );

      expect(res.status).toBe(304);
    });

    it("looks the picture up in the caller's company only", async () => {
      prisma.userAvatar.findFirst.mockResolvedValue(null);

      const res = await asUser(
        request(server).get('/users/other/avatar'),
        'u1',
        'c1',
      );

      expect(res.status).toBe(404);
      expect(prisma.userAvatar.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'other',
            user: { companyId: 'c1', deletedAt: null },
          },
        }),
      );
    });

    it('requires a signed-in user', async () => {
      const res = await request(server).get('/users/u2/avatar');

      expect(res.status).toBe(403);
      expect(prisma.userAvatar.findFirst).not.toHaveBeenCalled();
    });
  });
});
