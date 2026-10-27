/**
 * Registration with an optional profile picture: the multipart wiring on the
 * real AuthController, and AuthService.register()'s handling of the picture.
 */
import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';

import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AVATAR_MAX_BYTES } from '../user/avatar/avatar.constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

function png(extra = 0): Buffer {
  const buf = Buffer.alloc(40 + extra);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(64, 16);
  buf.writeUInt32BE(64, 20);
  return buf;
}

const fields = {
  firstName: 'Mona',
  lastName: 'Ali',
  email: 'mona@example.com',
  password: 'Str0ng!Passw0rd',
  companyName: 'Orbit Test Co',
};

describe('POST /auth/register (HTTP wiring)', () => {
  let app: INestApplication;
  let server: Server;
  const register = jest.fn();
  const callArgs = (n = 0) =>
    register.mock.calls[n] as [unknown, { buffer: Buffer } | undefined];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { register } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: JwtService, useValue: {} },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
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

  afterAll(() => app.close());

  beforeEach(() => {
    register.mockReset();
    register.mockResolvedValue({
      success: true,
      message: 'ok',
      avatarSaved: false,
    });
  });

  it('still accepts the plain JSON registration (no picture)', async () => {
    const res = await request(server).post('/auth/register').send(fields);

    expect(res.status).toBe(201);
    expect(register).toHaveBeenCalledTimes(1);
    expect(callArgs()[1]).toBeUndefined();
  });

  it('accepts multipart/form-data and hands the picture to the service', async () => {
    const req = request(server).post('/auth/register');
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    const res = await req.attach('avatar', png(), {
      filename: 'me.png',
      contentType: 'image/png',
    });

    expect(res.status).toBe(201);
    const [dto, file] = callArgs();
    expect(dto).toMatchObject(fields);
    expect(Buffer.isBuffer(file?.buffer)).toBe(true);
    expect(file?.buffer.length).toBe(40);
  });

  it('accepts multipart with no picture at all', async () => {
    const req = request(server).post('/auth/register');
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    const res = await req;

    expect(res.status).toBe(201);
    expect(callArgs()[1]).toBeUndefined();
  });

  it('refuses an oversized picture with 413 before the service runs', async () => {
    const req = request(server).post('/auth/register');
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    const res = await req.attach('avatar', png(AVATAR_MAX_BYTES), {
      filename: 'big.png',
      contentType: 'image/png',
    });

    expect(res.status).toBe(413);
    expect(register).not.toHaveBeenCalled();
  });

  it('still validates the text fields in multipart requests', async () => {
    const res = await request(server)
      .post('/auth/register')
      .field('firstName', 'Mona')
      .attach('avatar', png(), { filename: 'me.png' });

    expect(res.status).toBe(400);
    expect(register).not.toHaveBeenCalled();
  });
});

describe('AuthService.register() with a picture', () => {
  function build() {
    const created: Record<string, unknown[]> = {
      user: [],
      avatar: [],
      userUpdate: [],
      verification: [],
    };
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn((args: unknown) => {
          created.user.push(args);
          return Promise.resolve({ id: 'new-user' });
        }),
        update: jest.fn((args: unknown) => {
          created.userUpdate.push(args);
          return Promise.resolve({});
        }),
      },
      userAvatar: {
        create: jest.fn((args: unknown) => {
          created.avatar.push(args);
          return Promise.resolve({});
        }),
      },
      emailVerification: {
        create: jest.fn((args: unknown) => {
          created.verification.push(args);
          return Promise.resolve({});
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((cb: (t: unknown) => unknown) =>
        Promise.resolve(cb(tx)),
      ),
    };
    const service = new AuthService(
      prisma as never,
      { findByEmail: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
      { hash: jest.fn().mockResolvedValue('hash') } as never,
      {
        sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma, created };
  }

  const dto = {
    ...fields,
    phone: undefined,
    // A legacy client-supplied URL must never be stored.
    avatar: 'https://tracker.example/pixel.png',
  };

  it('stores the picture with the account in one transaction and links it', async () => {
    const { service, prisma, created } = build();
    const buffer = png();

    const result = await service.register(dto, {
      buffer,
      size: buffer.length,
    });

    expect(result).toMatchObject({ success: true, avatarSaved: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(created.avatar).toHaveLength(1);
    expect(
      (created.avatar[0] as { data: { userId: string; contentType: string } })
        .data,
    ).toMatchObject({ userId: 'new-user', contentType: 'image/png' });
    expect(
      (created.userUpdate[0] as { data: { avatar: string } }).data.avatar,
    ).toMatch(/^\/users\/new-user\/avatar\?v=[0-9a-f]{16}$/);
  });

  it('ignores a client-supplied avatar URL', async () => {
    const { service, created } = build();

    const result = await service.register(dto);

    expect(result).toMatchObject({ avatarSaved: false });
    const data = (created.user[0] as { data: Record<string, unknown> }).data;
    expect(data).not.toHaveProperty('avatar');
    expect(created.avatar).toHaveLength(0);
  });

  it('rejects an invalid picture before creating anything', async () => {
    const { service, prisma } = build();
    const buffer = Buffer.from('<script>alert(1)</script>');

    await expect(
      service.register(dto, { buffer, size: buffer.length }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
