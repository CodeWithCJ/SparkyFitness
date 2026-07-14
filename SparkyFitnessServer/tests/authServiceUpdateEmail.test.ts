import { vi, beforeEach, afterEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import authService from '../services/authService.js';
import userRepository from '../models/userRepository.js';

vi.mock('../models/userRepository.js', () => ({
  default: {
    findUserByEmail: vi.fn(),
    updateUserEmail: vi.fn(),
    getCredentialPasswordHash: vi.fn(),
  },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const priorAdminEmail = process.env.SPARKY_FITNESS_ADMIN_EMAIL;
const PASSWORD_HASH = bcrypt.hashSync('correct-horse', 10);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(userRepository.findUserByEmail).mockResolvedValue(undefined);
  vi.mocked(userRepository.updateUserEmail).mockResolvedValue(true);
});

afterEach(() => {
  if (priorAdminEmail === undefined) {
    delete process.env.SPARKY_FITNESS_ADMIN_EMAIL;
  } else {
    process.env.SPARKY_FITNESS_ADMIN_EMAIL = priorAdminEmail;
  }
});

describe('authService.updateUserEmail', () => {
  it('refuses to adopt the configured admin email and does not write', async () => {
    process.env.SPARKY_FITNESS_ADMIN_EMAIL = 'admin@example.com';

    await expect(
      authService.updateUserEmail('attacker-id', 'admin@example.com', 'pw')
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(userRepository.updateUserEmail).not.toHaveBeenCalled();
    expect(userRepository.getCredentialPasswordHash).not.toHaveBeenCalled();
  });

  it('requires the correct current password for a credential account', async () => {
    vi.mocked(userRepository.getCredentialPasswordHash).mockResolvedValue(
      PASSWORD_HASH
    );

    await expect(
      authService.updateUserEmail('user-id', 'new@example.com', 'wrong')
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(userRepository.updateUserEmail).not.toHaveBeenCalled();
  });

  it('rejects a credential account when no password is supplied', async () => {
    vi.mocked(userRepository.getCredentialPasswordHash).mockResolvedValue(
      PASSWORD_HASH
    );

    await expect(
      authService.updateUserEmail('user-id', 'new@example.com', undefined)
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(userRepository.updateUserEmail).not.toHaveBeenCalled();
  });

  it('changes the email when the current password matches', async () => {
    vi.mocked(userRepository.getCredentialPasswordHash).mockResolvedValue(
      PASSWORD_HASH
    );

    await expect(
      authService.updateUserEmail('user-id', 'new@example.com', 'correct-horse')
    ).resolves.toBe(true);
    expect(userRepository.updateUserEmail).toHaveBeenCalledWith(
      'user-id',
      'new@example.com'
    );
  });

  it('allows an SSO-only account (no local password) to change email on the session alone', async () => {
    vi.mocked(userRepository.getCredentialPasswordHash).mockResolvedValue(null);

    await expect(
      authService.updateUserEmail('sso-user', 'new@example.com', undefined)
    ).resolves.toBe(true);
    expect(userRepository.updateUserEmail).toHaveBeenCalledWith(
      'sso-user',
      'new@example.com'
    );
  });
});
