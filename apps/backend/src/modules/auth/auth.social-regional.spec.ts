/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/**
 * Social sign-up + the optional regional-hints handoff: hints survive the
 * OAuth redirect through a server-side token, are claimed inside the same
 * transaction that creates the company, and never block sign-in.
 */
import { AuthService } from './auth.service';

const mockPermissions = [
  'contact',
  'lead',
  'deal',
  'task',
  'calendar',
  'activity',
].flatMap((resource) =>
  ['create', 'read', 'update', 'delete'].map((action) => ({
    id: `perm-${resource}-${action}`,
    resource,
    action,
  })),
);

function build(opts: {
  consume?: jest.Mock;
  companyCreate?: jest.Mock;
  toCompanyData?: jest.Mock;
}) {
  const tx = {
    company: {
      create: opts.companyCreate ?? jest.fn().mockResolvedValue({ id: 'c1' }),
    },
    user: { create: jest.fn().mockResolvedValue({ id: 'u1' }) },
    socialAccount: { create: jest.fn().mockResolvedValue({}) },
    permission: {
      findMany: jest.fn().mockResolvedValue(mockPermissions),
      upsert: jest.fn(),
    },
    role: { upsert: jest.fn().mockResolvedValue({ id: 'r' }) },
  };
  const prisma = {
    $transaction: jest.fn((cb: (t: unknown) => unknown) =>
      Promise.resolve(cb(tx)),
    ),
  };
  const provider = {
    isConfigured: () => true,
    getProfile: jest.fn().mockResolvedValue({
      email: 'New@Example.com',
      emailVerified: true,
      providerAccountId: 'g-1',
      firstName: 'Mona',
      lastName: 'Ali',
    }),
  };
  const consume = opts.consume ?? jest.fn().mockResolvedValue(null);
  const toCompanyData = opts.toCompanyData ?? jest.fn().mockResolvedValue({});
  const service = new AuthService(
    prisma as never,
    {
      findByEmail: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'new@example.com',
        isActive: true,
        isOwner: true,
        companyId: 'c1',
        firstName: 'Mona',
        lastName: 'Ali',
        roleId: null,
        avatar: null,
        language: 'en',
        backgroundColor: null,
        isEmailVerified: true,
      }),
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { create: jest.fn().mockResolvedValue(undefined) } as never,
    {} as never,
    {
      findByProviderAccount: jest.fn().mockResolvedValue(null),
    } as never,
    { getOrThrow: jest.fn().mockReturnValue('7d'), get: jest.fn() } as never,
    { hash: jest.fn().mockReturnValue('h') } as never,
    { verify: jest.fn().mockReturnValue(true) } as never,
    provider as never,
    provider as never,
    provider as never,
    { sign: jest.fn().mockReturnValue('jwt') } as never,
    {
      capture: jest.fn(),
      toCompanyData,
      timezoneOf: jest.fn(
        (h: { timezone?: string } | null) => h?.timezone ?? null,
      ),
    } as never,
    { consume } as never,
  );
  return { service, tx, consume, toCompanyData, prisma };
}

const TOKEN = 'a'.repeat(43);
const hints = { v: 1, timezone: 'Africa/Cairo', capturedAt: 'x' };

describe('AuthService.handleSocialCallback — regional handoff', () => {
  it('claims the handoff INSIDE the transaction and stores the suggestion on the new company', async () => {
    const suggestion = {
      suggestedCountryCode: 'EG',
      regionalStatus: 'DETECTED',
    };
    const consume = jest.fn().mockResolvedValue(hints);
    const toCompanyData = jest.fn().mockResolvedValue(suggestion);
    const { service, tx } = build({ consume, toCompanyData });

    await service.handleSocialCallback('google', 'code', 'state', TOKEN);

    expect(consume).toHaveBeenCalledWith(tx, TOKEN);
    const company = tx.company.create.mock.calls[0][0] as { data: object };
    expect(company.data).toMatchObject(suggestion);
    expect(company.data).not.toHaveProperty('countryCode');
    const user = tx.user.create.mock.calls[0][0] as {
      data: { timezone: string };
    };
    expect(user.data.timezone).toBe('Africa/Cairo');
  });

  it('works exactly as before when no handoff token is present', async () => {
    const { service, tx, consume } = build({});

    await expect(
      service.handleSocialCallback('google', 'code', 'state'),
    ).resolves.toBeDefined();

    expect(consume).toHaveBeenCalledWith(tx, undefined);
    const company = tx.company.create.mock.calls[0][0] as { data: object };
    expect(company.data).not.toHaveProperty('regionalStatus');
  });

  it('an invalid / expired / reused token (consume => null) never blocks sign-up', async () => {
    const { service, tx } = build({
      consume: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.handleSocialCallback('google', 'code', 'state', TOKEN),
    ).resolves.toBeDefined();
    expect(tx.company.create).toHaveBeenCalledTimes(1);
  });

  it('a failing transaction does not spend the handoff outside it (claim is tx-scoped)', async () => {
    const companyCreate = jest.fn().mockRejectedValue(new Error('db error'));
    const consume = jest.fn().mockResolvedValue(hints);
    const { service, tx } = build({ consume, companyCreate });

    await expect(
      service.handleSocialCallback('google', 'code', 'state', TOKEN),
    ).rejects.toThrow('db error');

    // consume ran with the transaction client, so Postgres rolls the claim back.
    expect(consume.mock.calls[0][0]).toBe(tx);
  });
});
