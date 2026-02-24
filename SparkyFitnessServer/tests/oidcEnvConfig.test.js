const { getEnvOidcConfig } = require('../utils/oidcEnvConfig');

describe('oidcEnvConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
        // Clear OIDC env vars to start fresh
        delete process.env.SPARKY_FITNESS_OIDC_ISSUER_URL;
        delete process.env.SPARKY_FITNESS_OIDC_CLIENT_ID;
        delete process.env.SPARKY_FITNESS_OIDC_CLIENT_SECRET;
        delete process.env.SPARKY_FITNESS_OIDC_PROVIDER_SLUG;
        delete process.env.SPARKY_FITNESS_OIDC_PROVIDER_NAME;
        delete process.env.SPARKY_FITNESS_OIDC_SCOPE;
        delete process.env.SPARKY_FITNESS_OIDC_AUTO_REGISTER;
        delete process.env.SPARKY_FITNESS_OIDC_LOGO_URL;
        delete process.env.SPARKY_FITNESS_OIDC_DOMAIN;
        delete process.env.SPARKY_FITNESS_OIDC_TOKEN_AUTH_METHOD;
        delete process.env.SPARKY_FITNESS_OIDC_ID_TOKEN_SIGNED_ALG;
        delete process.env.SPARKY_FITNESS_OIDC_USERINFO_SIGNED_ALG;
        delete process.env.SPARKY_FITNESS_OIDC_TIMEOUT;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    describe('getEnvOidcConfig', () => {
        it('should return null if required env vars are missing', () => {
            process.env.SPARKY_FITNESS_OIDC_ISSUER_URL = 'http://issuer.com';
            // Missing others
            expect(getEnvOidcConfig()).toBeNull();
        });

        it('should return config with default scope if not provided', () => {
            process.env.SPARKY_FITNESS_OIDC_ISSUER_URL = 'http://issuer.com/';
            process.env.SPARKY_FITNESS_OIDC_CLIENT_ID = 'test-client';
            process.env.SPARKY_FITNESS_OIDC_CLIENT_SECRET = 'test-secret';
            process.env.SPARKY_FITNESS_OIDC_PROVIDER_SLUG = 'test-slug';

            const config = getEnvOidcConfig();
            expect(config).toEqual(expect.objectContaining({
                issuer_url: 'http://issuer.com',
                client_id: 'test-client',
                client_secret: 'test-secret',
                provider_id: 'test-slug',
                scope: 'openid email profile',
                is_env_configured: true
            }));
        });

        it('should use SPARKY_FITNESS_OIDC_SCOPE if provided', () => {
            process.env.SPARKY_FITNESS_OIDC_ISSUER_URL = 'http://issuer.com';
            process.env.SPARKY_FITNESS_OIDC_CLIENT_ID = 'test-client';
            process.env.SPARKY_FITNESS_OIDC_CLIENT_SECRET = 'test-secret';
            process.env.SPARKY_FITNESS_OIDC_PROVIDER_SLUG = 'test-slug';
            process.env.SPARKY_FITNESS_OIDC_SCOPE = 'openid custom-scope';

            const config = getEnvOidcConfig();
            expect(config.scope).toBe('openid custom-scope');
        });
        it('should return config with all new fields if provided', () => {
            process.env.SPARKY_FITNESS_OIDC_ISSUER_URL = 'http://issuer.com';
            process.env.SPARKY_FITNESS_OIDC_CLIENT_ID = 'test-client';
            process.env.SPARKY_FITNESS_OIDC_CLIENT_SECRET = 'test-secret';
            process.env.SPARKY_FITNESS_OIDC_PROVIDER_SLUG = 'test-slug';
            process.env.SPARKY_FITNESS_OIDC_AUTO_REGISTER = 'false';
            process.env.SPARKY_FITNESS_OIDC_LOGO_URL = 'http://logo.com/img.png';
            process.env.SPARKY_FITNESS_OIDC_DOMAIN = 'custom.domain';
            process.env.SPARKY_FITNESS_OIDC_TOKEN_AUTH_METHOD = 'client_secret_basic';
            process.env.SPARKY_FITNESS_OIDC_ID_TOKEN_SIGNED_ALG = 'ES256';
            process.env.SPARKY_FITNESS_OIDC_USERINFO_SIGNED_ALG = 'RS256';
            process.env.SPARKY_FITNESS_OIDC_TIMEOUT = '45000';

            const config = getEnvOidcConfig();
            expect(config).toEqual(expect.objectContaining({
                auto_register: false,
                logo_url: 'http://logo.com/img.png',
                domain: 'custom.domain',
                token_endpoint_auth_method: 'client_secret_basic',
                signing_algorithm: 'ES256',
                profile_signing_algorithm: 'RS256',
                timeout: 45000
            }));
        });
    });
});
