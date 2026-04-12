import { vi, beforeEach, describe, expect, it } from 'vitest';
import { syncUserGroups } from '../utils/oidcGroupSync.js';
vi.mock('jose', () => ({
  decodeJwt: vi.fn((token) => {
    const parts = token.split('.');
    if (parts.length < 2) return {};
    try {
      return JSON.parse(Buffer.from(parts[1], 'base64').toString());
    } catch {
      return {};
    }
  }),
}));
describe('oidcGroupSync', () => {
  let mockPool;
  let mockUserRepository;
  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    };
    mockUserRepository = {
      getUserRole: vi.fn(),
      updateUserRole: vi.fn(),
    };
    vi.clearAllMocks();
  });
  const createIdToken = (payload) => {
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' })
    ).toString('base64');
    const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64');
    return `${header}.${payloadStr}.signature`;
  };
  it('should promote user to admin if they have the admin group claim', async () => {
    const userId = 'user-1';
    const adminGroup = 'Admins';
    const idToken = createIdToken({ groups: ['Admins', 'Users'] });
    mockPool.query.mockResolvedValue({
      rows: [{ provider_id: 'oidc-authentik', id_token: idToken }],
    });
    mockUserRepository.getUserRole.mockResolvedValue('user');
    await syncUserGroups(
      { pool: mockPool, userRepository: mockUserRepository },
      userId,
      adminGroup
    );
    expect(mockUserRepository.updateUserRole).toHaveBeenCalledWith(
      userId,
      'admin'
    );
  });
  it('should revoke admin role if user no longer has the admin group claim', async () => {
    const userId = 'user-1';
    const adminGroup = 'Admins';
    const idToken = createIdToken({ groups: ['Users'] });
    mockPool.query.mockResolvedValue({
      rows: [{ provider_id: 'oidc-authentik', id_token: idToken }],
    });
    mockUserRepository.getUserRole.mockResolvedValue('admin');
    await syncUserGroups(
      { pool: mockPool, userRepository: mockUserRepository },
      userId,
      adminGroup
    );
    expect(mockUserRepository.updateUserRole).toHaveBeenCalledWith(
      userId,
      'user'
    );
  });
  it('should do nothing if user already has the correct role', async () => {
    const userId = 'user-1';
    const adminGroup = 'Admins';
    const idToken = createIdToken({ groups: ['Admins'] });
    mockPool.query.mockResolvedValue({
      rows: [{ provider_id: 'oidc-authentik', id_token: idToken }],
    });
    mockUserRepository.getUserRole.mockResolvedValue('admin');
    await syncUserGroups(
      { pool: mockPool, userRepository: mockUserRepository },
      userId,
      adminGroup
    );
    expect(mockUserRepository.updateUserRole).not.toHaveBeenCalled();
  });
  it('should handle missing groups claim gracefully', async () => {
    const userId = 'user-1';
    const adminGroup = 'Admins';
    const idToken = createIdToken({ email: 'test@test.com' }); // No groups
    mockPool.query.mockResolvedValue({
      rows: [{ provider_id: 'oidc-authentik', id_token: idToken }],
    });
    mockUserRepository.getUserRole.mockResolvedValue('admin');
    await syncUserGroups(
      { pool: mockPool, userRepository: mockUserRepository },
      userId,
      adminGroup
    );
    expect(mockUserRepository.updateUserRole).toHaveBeenCalledWith(
      userId,
      'user'
    );
  });
  it('should use the first account with an id_token (most recent due to ORDER BY)', async () => {
    const userId = 'user-1';
    const adminGroup = 'Admins';
    const olderIdToken = createIdToken({ groups: ['Users'] });
    const newerIdToken = createIdToken({ groups: ['Admins'] });
    // Mocks return from pool.query (ordered by updated_at DESC in the real query)
    mockPool.query.mockResolvedValue({
      rows: [
        { provider_id: 'oidc-provider-new', id_token: newerIdToken },
        { provider_id: 'oidc-provider-old', id_token: olderIdToken },
      ],
    });
    mockUserRepository.getUserRole.mockResolvedValue('user');
    await syncUserGroups(
      { pool: mockPool, userRepository: mockUserRepository },
      userId,
      adminGroup
    );
    expect(mockUserRepository.updateUserRole).toHaveBeenCalledWith(
      userId,
      'admin'
    );
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY updated_at DESC'),
      [userId]
    );
  });
  it('should not allow substring matching if groups claim is a string', async () => {
    const userId = 'user-1';
    const adminGroup = 'admin';
    // If it was treated as a string, "superadmin".includes("admin") would be true
    const idToken = createIdToken({ groups: 'superadmin' });
    mockPool.query.mockResolvedValue({
      rows: [{ provider_id: 'oidc-authentik', id_token: idToken }],
    });
    mockUserRepository.getUserRole.mockResolvedValue('user');
    await syncUserGroups(
      { pool: mockPool, userRepository: mockUserRepository },
      userId,
      adminGroup
    );
    expect(mockUserRepository.updateUserRole).not.toHaveBeenCalled();
  });
  it('should skip group sync if the token is expired', async () => {
    const userId = 'user-1';
    const adminGroup = 'Admins';
    const now = Math.floor(Date.now() / 1000);
    // Expired 1 hour ago
    const idToken = createIdToken({
      groups: ['Admins'],
      exp: now - 3600,
    });
    mockPool.query.mockResolvedValue({
      rows: [{ provider_id: 'oidc-authentik', id_token: idToken }],
    });
    mockUserRepository.getUserRole.mockResolvedValue('user');
    await syncUserGroups(
      { pool: mockPool, userRepository: mockUserRepository },
      userId,
      adminGroup
    );
    expect(mockUserRepository.updateUserRole).not.toHaveBeenCalled();
  });
  it('should fetch groups from UserInfo if id_token has no groups', async () => {
    const userId = 'user-1';
    const adminGroup = 'Admins';
    const idToken = createIdToken({ email: 'test@test.com' }); // No groups
    const accessToken = 'valid-access-token';
    const mockOidcProviderRepository = {
      getOidcProviderById: vi.fn().mockResolvedValue({
        userInfoEndpoint: 'https://issuer.com/userinfo',
      }),
    };
    mockPool.query.mockResolvedValue({
      rows: [
        {
          provider_id: 'oidc-authelia',
          id_token: idToken,
          access_token: accessToken,
        },
      ],
    });
    mockUserRepository.getUserRole.mockResolvedValue('user');
    // Mock global fetch for Node 20+
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ groups: ['Admins'] }),
    });
    await syncUserGroups(
      {
        pool: mockPool,
        userRepository: mockUserRepository,
        oidcProviderRepository: mockOidcProviderRepository,
      },
      userId,
      adminGroup
    );
    expect(mockUserRepository.updateUserRole).toHaveBeenCalledWith(
      userId,
      'admin'
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'https://issuer.com/userinfo',
      expect.any(Object)
    );
    delete global.fetch;
  });
});
