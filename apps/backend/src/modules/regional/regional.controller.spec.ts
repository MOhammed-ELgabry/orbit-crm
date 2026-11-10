/* eslint-disable @typescript-eslint/unbound-method */
import { GUARDS_METADATA } from '@nestjs/common/constants';

import { CsrfGuard } from '../../common/security/csrf.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerGuard } from '../auth/guards/owner.guard';

import { RegionalController } from './regional.controller';

const guardsOf = (method: keyof RegionalController): unknown[] =>
  (Reflect.getMetadata(
    GUARDS_METADATA,
    RegionalController.prototype[method],
  ) as unknown[] | undefined) ?? [];

describe('RegionalController protection', () => {
  it('PUT /regional/settings is Owner-only and CSRF-protected', () => {
    const guards = guardsOf('confirmSettings');
    expect(guards).toEqual(
      expect.arrayContaining([JwtAuthGuard, OwnerGuard, CsrfGuard]),
    );
  });

  it('reading settings / reference data requires login but not ownership', () => {
    for (const m of ['getSettings', 'referenceData'] as const) {
      const guards = guardsOf(m);
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).not.toContain(OwnerGuard);
    }
  });

  it('the pre-login handoff endpoint carries no auth guard (used before sign-in) but is rate limited', () => {
    expect(guardsOf('createHandoff')).toHaveLength(0);
    const limit = Reflect.getMetadata(
      'THROTTLER:LIMITdefault',
      RegionalController.prototype.createHandoff,
    ) as number;
    expect(limit).toBe(20);
  });
});

describe('RegionalController.confirmSettings', () => {
  it('audits with the actor id only — no IP / user agent', async () => {
    const settings = { confirm: jest.fn().mockResolvedValue({}) };
    const controller = new RegionalController(
      {} as never,
      settings as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
    );
    const dto = {
      countryCode: 'EG',
      baseCurrencyCode: 'EGP',
      timezone: 'Africa/Cairo',
      defaultLocale: 'ar-EG',
    };

    await controller.confirmSettings(dto, {
      user: { sub: 'u1', companyId: 'c1', isOwner: true },
      ip: '41.1.2.3',
      headers: { 'user-agent': 'x' },
    } as never);

    expect(settings.confirm).toHaveBeenCalledWith('c1', dto, {
      actorUserId: 'u1',
    });
  });

  it('uses the company of the JWT, never one from the body', async () => {
    const settings = { get: jest.fn().mockResolvedValue({}) };
    const controller = new RegionalController(
      {} as never,
      settings as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
    );
    await controller.getSettings({
      user: { sub: 'u1', companyId: 'jwt-company', isOwner: false },
    } as never);
    expect(settings.get).toHaveBeenCalledWith('jwt-company', false);
  });
});

describe('RegionalController.createHandoff', () => {
  it('returns { token: null } when nothing usable arrives, and a token otherwise', async () => {
    const capture = { capture: jest.fn() };
    const handoff = { create: jest.fn().mockResolvedValue('t'.repeat(43)) };
    const controller = new RegionalController(
      {} as never,
      {} as never,
      capture as never,
      handoff as never,
      { get: jest.fn() } as never,
    );

    capture.capture.mockResolvedValueOnce(null);
    expect(
      await controller.createHandoff({ hints: 'junk' }, {
        ip: '1.1.1.1',
      } as never),
    ).toEqual({ token: null });
    expect(handoff.create).not.toHaveBeenCalled();

    capture.capture.mockResolvedValueOnce({
      v: 1,
      capturedAt: 'x',
      timezone: 'Africa/Cairo',
    });
    expect(
      await controller.createHandoff({ hints: {} }, { ip: '1.1.1.1' } as never),
    ).toEqual({ token: 't'.repeat(43) });
  });
});
