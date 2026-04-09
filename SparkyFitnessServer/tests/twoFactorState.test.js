import { resolveTwoFactorDisableUserUpdate } from '../utils/twoFactorState.js';
describe('resolveTwoFactorDisableUserUpdate', () => {
  it('preserves the global MFA flag when disabling TOTP and email MFA remains enabled', async () => {
    const findUserById = jest.fn().mockResolvedValue({
      id: 'user-123',
      mfa_email_enabled: true,
    });
    const result = await resolveTwoFactorDisableUserUpdate(
      { twoFactorEnabled: false },
      {
        path: '/two-factor/disable',
        context: {
          session: {
            user: { id: 'user-123' },
          },
        },
      },
      findUserById
    );
    expect(findUserById).toHaveBeenCalledWith('user-123');
    expect(result).toEqual({ twoFactorEnabled: true });
  });
  it('does not change the update when email MFA is not enabled', async () => {
    const findUserById = jest.fn().mockResolvedValue({
      id: 'user-123',
      mfa_email_enabled: false,
    });
    const result = await resolveTwoFactorDisableUserUpdate(
      { twoFactorEnabled: false },
      {
        path: '/two-factor/disable',
        context: {
          session: {
            user: { id: 'user-123' },
          },
        },
      },
      findUserById
    );
    expect(result).toBeNull();
  });
  it('ignores unrelated user updates', async () => {
    const findUserById = jest.fn();
    const result = await resolveTwoFactorDisableUserUpdate(
      { twoFactorEnabled: false },
      {
        path: '/update-user',
        context: {
          session: {
            user: { id: 'user-123' },
          },
        },
      },
      findUserById
    );
    expect(findUserById).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
