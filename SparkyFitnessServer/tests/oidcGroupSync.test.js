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
});
