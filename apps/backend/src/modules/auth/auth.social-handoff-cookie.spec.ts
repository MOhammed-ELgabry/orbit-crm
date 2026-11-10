/**
 * HTTP wiring of the regional-hints handoff cookie around the social
 * sign-in redirect: set at /start only for a well-formed opaque token, passed
 * to the service at /callback and cleared afterwards.
 */
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'http';
import request from 'supertest';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const TOKEN = 'Zx9_-'.repeat(8) + 'abc'; // 43 url-safe chars

describe('social sign-in regional handoff cookie', () => {
  let app: INestApplication;
  let server: Server;
  const getSocialAuthorizeUrl = jest
    .fn()
    .mockResolvedValue('https://accounts.example/authorize');
  const handleSocialCallback = jest.fn().mockResolvedValue({
    accessToken: 'a',
    refreshToken: 'r',
    user: { id: 'u1' },
    isNewUser: true,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: { getSocialAuthorizeUrl, handleSocialCallback },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((k: string) =>
              k === 'app.frontendUrl' ? 'http://localhost:5173' : undefined,
            ),
            getOrThrow: jest.fn().mockReturnValue('http://localhost:5173'),
          },
        },
        { provide: JwtService, useValue: {} },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.use(cookieParser());
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  const setCookies = (res: request.Response): string[] =>
    (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];

  it('/start stores a well-formed token in an HttpOnly cookie, then redirects to the provider', async () => {
    const res = await request(server).get(
      `/auth/social/google/start?rh=${TOKEN}`,
    );

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://accounts.example/authorize');
    const cookie = setCookies(res).find((c) => c.startsWith('orbit_rh='));
    expect(cookie).toBeDefined();
    expect(cookie).toContain(TOKEN);
    expect(cookie).toMatch(/HttpOnly/i);
    // the provider URL carries no regional data
    expect(res.headers.location).not.toContain(TOKEN);
  });

  it.each(['short', 'x'.repeat(44), '<script>'.padEnd(43, 'a'), ''])(
    '/start ignores a malformed token (%p) but still redirects',
    async (rh) => {
      const res = await request(server).get(
        `/auth/social/google/start?rh=${encodeURIComponent(rh)}`,
      );
      expect(res.status).toBe(302);
      expect(setCookies(res).some((c) => c.startsWith('orbit_rh='))).toBe(
        false,
      );
    },
  );

  it('/start without a token behaves exactly as before', async () => {
    const res = await request(server).get('/auth/social/google/start');
    expect(res.status).toBe(302);
    expect(setCookies(res)).toHaveLength(0);
  });

  it('/callback hands the cookie token to the service and clears the cookie', async () => {
    const res = await request(server)
      .get('/auth/social/google/callback?code=c&state=s')
      .set('Cookie', `orbit_rh=${TOKEN}`);

    expect(handleSocialCallback).toHaveBeenCalledWith(
      'google',
      'c',
      's',
      TOKEN,
    );
    const cleared = setCookies(res).find((c) => c.startsWith('orbit_rh='));
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('/callback works without any cookie', async () => {
    await request(server).get('/auth/social/google/callback?code=c&state=s');
    expect(handleSocialCallback).toHaveBeenCalledWith(
      'google',
      'c',
      's',
      undefined,
    );
  });
});
