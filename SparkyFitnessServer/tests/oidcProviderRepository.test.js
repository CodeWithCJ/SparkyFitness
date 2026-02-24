const oidcProviderRepository = require('../models/oidcProviderRepository');
const { getSystemClient } = require('../db/poolManager');

// Mock dependencies
jest.mock('../db/poolManager', () => ({
    getSystemClient: jest.fn(),
}));

jest.mock('../config/logging', () => ({
    log: jest.fn(),
}));

global.fetch = jest.fn();

describe('oidcProviderRepository', () => {
    let mockClient;

    beforeEach(() => {
        mockClient = {
            query: jest.fn(),
            release: jest.fn(),
        };
        getSystemClient.mockResolvedValue(mockClient);
        jest.clearAllMocks();
    });

    describe('createOidcProvider', () => {
        it('should persist is_env_configured in additional_config', async () => {
            const providerData = {
                issuer_url: 'http://issuer.com',
                client_id: 'client-id',
                client_secret: 'client-secret',
                display_name: 'Test Provider',
                is_env_configured: true,
                auto_register: true
            };

            mockClient.query.mockResolvedValue({ rows: [{ id: 'new-id' }] });

            // Mock fetch for discovery document
            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    authorization_endpoint: 'http://auth.com',
                    token_endpoint: 'http://token.com',
                    userinfo_endpoint: 'http://user.com',
                    jwks_uri: 'http://jwks.com',
                    issuer: 'http://issuer.com'
                })
            });

            await oidcProviderRepository.createOidcProvider(providerData);

            // Check the second call to query (the INSERT into sso_provider)
            const insertCall = mockClient.query.mock.calls.find(call =>
                typeof call[0] === 'string' && call[0].includes('INSERT INTO "sso_provider"')
            );

            expect(insertCall).toBeDefined();
            const configJson = JSON.parse(insertCall[1][11]);
            expect(configJson.is_env_configured).toBe(true);
        });
    });

    describe('updateOidcProvider', () => {
        it('should update is_env_configured in additional_config', async () => {
            const providerId = 'test-id';
            const providerData = {
                issuer_url: 'http://issuer.com',
                client_id: 'client-id',
                display_name: 'Updated Provider',
                is_env_configured: true
            };

            mockClient.query.mockResolvedValueOnce({ rows: [{ client_secret: 'old-secret' }] }); // for getOidcProviderById inside update
            mockClient.query.mockResolvedValueOnce({ rows: [] }); // for update

            // Mock fetch for discovery document
            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    authorization_endpoint: 'http://auth.com',
                    token_endpoint: 'http://token.com',
                    userinfo_endpoint: 'http://user.com',
                    jwks_uri: 'http://jwks.com',
                    issuer: 'http://issuer.com'
                })
            });

            await oidcProviderRepository.updateOidcProvider(providerId, providerData);

            const updateCall = mockClient.query.mock.calls.find(call =>
                typeof call[0] === 'string' && call[0].includes('UPDATE "sso_provider"')
            );

            expect(updateCall).toBeDefined();
            const configJson = JSON.parse(updateCall[1][10]);
            expect(configJson.is_env_configured).toBe(true);
        });
    });
});
