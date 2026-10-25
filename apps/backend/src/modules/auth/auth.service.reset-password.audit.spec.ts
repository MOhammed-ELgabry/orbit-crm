import { AuthService } from './auth.service';

/**
 * Focused test: resetPassword hands the repository an audit actor describing
 * the reset-token flow. Everything else in AuthService is irrelevant here, so
 * only the collaborators resetPassword touches are real mocks.
 */
describe('AuthService.resetPassword audit actor', () => {
  function build() {
    const userRepository = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'user-1', isActive: true, companyId: 'c-1' }),
      updatePassword: jest.fn().mockResolvedValue(undefined),
    };
    const passwordResetRepository = {
      findByTokenHash: jest.fn().mockResolvedValue({
        id: 'reset-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }),
      markAsUsed: jest.fn().mockResolvedValue(undefined),
    };
    const authSessionRepository = {
      revokeAllByUserId: jest.fn().mockResolvedValue(undefined),
    };

    const args = new Array(17).fill(undefined) as unknown[];
    args[1] = userRepository;
    args[3] = { hash: jest.fn().mockResolvedValue('NEW-HASH') };
    args[6] = authSessionRepository;
    args[7] = passwordResetRepository;
    args[10] = { hash: jest.fn().mockReturnValue('token-hash'), compare: jest.fn() };

    const service = new (
      AuthService as unknown as new (...a: unknown[]) => AuthService
    )(...args);

    return { service, userRepository };
  }

  it('passes actor = the account itself, method reset_token, and the request metadata', async () => {
    const { service, userRepository } = build();

    await service.resetPassword(
      { token: 'raw', newPassword: 'Str0ng!pass' },
      { ipAddress: '203.0.113.7', userAgent: 'jest' },
    );

    expect(userRepository.updatePassword).toHaveBeenCalledWith(
      'user-1',
      'NEW-HASH',
      {
        actorUserId: 'user-1',
        ipAddress: '203.0.113.7',
        userAgent: 'jest',
        metadata: { method: 'reset_token' },
      },
    );
  });

  it('still works without request metadata', async () => {
    const { service, userRepository } = build();

    await service.resetPassword({
      token: 'raw',
      newPassword: 'Str0ng!pass',
    });

    expect(userRepository.updatePassword).toHaveBeenCalledWith(
      'user-1',
      'NEW-HASH',
      { actorUserId: 'user-1', metadata: { method: 'reset_token' } },
    );
  });

  it('never puts the token or the password in the actor', async () => {
    const { service, userRepository } = build();

    await service.resetPassword({
      token: 'RAW-TOKEN-VALUE',
      newPassword: 'Str0ng!pass',
    });

    const serialized = JSON.stringify(userRepository.updatePassword.mock.calls);
    expect(serialized).not.toContain('RAW-TOKEN-VALUE');
    expect(serialized).not.toContain('Str0ng!pass');
  });
});



