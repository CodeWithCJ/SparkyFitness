const { syncUserGroups } = require('../utils/oidcGroupSync');

describe('oidcGroupSync', () => {
    let mockPool;
    let mockUserRepository;

    beforeEach(() => {
        mockPool = {
            query: jest.fn(),
        };
        mockUserRepository = {
            getUserRole: jest.fn(),
            updateUserRole: jest.fn(),
        };
        jest.clearAllMocks();
    });

    const createIdToken = (payload) => {
        const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64');
        const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64');
        return `${header}.${payloadStr}.signature`;
    };

    it('should promote user to admin if they have the admin group claim', async () => {
        const userId = 'user-1';
        const adminGroup = 'Admins';
        const idToken = createIdToken({ groups: ['Admins', 'Users'] });

        mockPool.query.mockResolvedValue({
            rows: [{ provider_id: 'authentik', id_token: idToken }]
        });
        mockUserRepository.getUserRole.mockResolvedValue('user');

        await syncUserGroups({ pool: mockPool, userRepository: mockUserRepository }, userId, adminGroup);

        expect(mockUserRepository.updateUserRole).toHaveBeenCalledWith(userId, 'admin');
    });

    it('should revoke admin role if user no longer has the admin group claim', async () => {
        const userId = 'user-1';
        const adminGroup = 'Admins';
        const idToken = createIdToken({ groups: ['Users'] });

        mockPool.query.mockResolvedValue({
            rows: [{ provider_id: 'authentik', id_token: idToken }]
        });
        mockUserRepository.getUserRole.mockResolvedValue('admin');

        await syncUserGroups({ pool: mockPool, userRepository: mockUserRepository }, userId, adminGroup);

        expect(mockUserRepository.updateUserRole).toHaveBeenCalledWith(userId, 'user');
    });

    it('should do nothing if user already has the correct role', async () => {
        const userId = 'user-1';
        const adminGroup = 'Admins';
        const idToken = createIdToken({ groups: ['Admins'] });

        mockPool.query.mockResolvedValue({
            rows: [{ provider_id: 'authentik', id_token: idToken }]
        });
        mockUserRepository.getUserRole.mockResolvedValue('admin');

        await syncUserGroups({ pool: mockPool, userRepository: mockUserRepository }, userId, adminGroup);

        expect(mockUserRepository.updateUserRole).not.toHaveBeenCalled();
    });

    it('should handle missing groups claim gracefully', async () => {
        const userId = 'user-1';
        const adminGroup = 'Admins';
        const idToken = createIdToken({ email: 'test@test.com' }); // No groups

        mockPool.query.mockResolvedValue({
            rows: [{ provider_id: 'authentik', id_token: idToken }]
        });
        mockUserRepository.getUserRole.mockResolvedValue('admin');

        await syncUserGroups({ pool: mockPool, userRepository: mockUserRepository }, userId, adminGroup);

        expect(mockUserRepository.updateUserRole).toHaveBeenCalledWith(userId, 'user');
    });

    it('should use the first account with an id_token (most recent due to ORDER BY)', async () => {
        const userId = 'user-1';
        const adminGroup = 'Admins';
        const olderIdToken = createIdToken({ groups: ['Users'] });
        const newerIdToken = createIdToken({ groups: ['Admins'] });

        // Mocks return from pool.query (ordered by updated_at DESC in the real query)
        mockPool.query.mockResolvedValue({
            rows: [
                { provider_id: 'provider-new', id_token: newerIdToken },
                { provider_id: 'provider-old', id_token: olderIdToken }
            ]
        });
        mockUserRepository.getUserRole.mockResolvedValue('user');

        await syncUserGroups({ pool: mockPool, userRepository: mockUserRepository }, userId, adminGroup);

        expect(mockUserRepository.updateUserRole).toHaveBeenCalledWith(userId, 'admin');
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
            rows: [{ provider_id: 'authentik', id_token: idToken }]
        });
        mockUserRepository.getUserRole.mockResolvedValue('user');

        await syncUserGroups({ pool: mockPool, userRepository: mockUserRepository }, userId, adminGroup);

        expect(mockUserRepository.updateUserRole).not.toHaveBeenCalled();
    });
});
