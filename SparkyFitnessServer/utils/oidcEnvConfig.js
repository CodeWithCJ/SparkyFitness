/**
 * OIDC environment configuration.
 * When SPARKY_FITNESS_OIDC_ISSUER_URL, CLIENT_ID, CLIENT_SECRET, and PROVIDER_SLUG are set,
 * an OIDC provider is upserted at startup so env-based config works with the existing
 * sso_provider / Better Auth flow.
 */

const { log } = require('../config/logging');

const ENV_ISSUER = 'SPARKY_FITNESS_OIDC_ISSUER_URL';
const ENV_CLIENT_ID = 'SPARKY_FITNESS_OIDC_CLIENT_ID';
const ENV_CLIENT_SECRET = 'SPARKY_FITNESS_OIDC_CLIENT_SECRET';
const ENV_PROVIDER_SLUG = 'SPARKY_FITNESS_OIDC_PROVIDER_SLUG';
const ENV_PROVIDER_NAME = 'SPARKY_FITNESS_OIDC_PROVIDER_NAME';
const ENV_SCOPE = 'SPARKY_FITNESS_OIDC_SCOPE';
const ENV_AUTO_REGISTER = 'SPARKY_FITNESS_OIDC_AUTO_REGISTER';
const ENV_LOGO_URL = 'SPARKY_FITNESS_OIDC_LOGO_URL';
const ENV_DOMAIN = 'SPARKY_FITNESS_OIDC_DOMAIN';
const ENV_TOKEN_AUTH_METHOD = 'SPARKY_FITNESS_OIDC_TOKEN_AUTH_METHOD';
const ENV_ID_TOKEN_SIGNED_ALG = 'SPARKY_FITNESS_OIDC_ID_TOKEN_SIGNED_ALG';
const ENV_USERINFO_SIGNED_ALG = 'SPARKY_FITNESS_OIDC_USERINFO_SIGNED_ALG';
const ENV_TIMEOUT = 'SPARKY_FITNESS_OIDC_TIMEOUT';

/**
 * Returns OIDC provider payload from env, or null if any required var is missing.
 * Issuer URL is normalized (no trailing slash).
 */
function getEnvOidcConfig() {
    const issuer = process.env[ENV_ISSUER]?.trim();
    const clientId = process.env[ENV_CLIENT_ID]?.trim();
    const clientSecret = process.env[ENV_CLIENT_SECRET]?.trim();
    const slug = process.env[ENV_PROVIDER_SLUG]?.trim();
    const name = process.env[ENV_PROVIDER_NAME]?.trim();
    const scope = process.env[ENV_SCOPE]?.trim();
    const logoUrl = process.env[ENV_LOGO_URL]?.trim();
    const domain = process.env[ENV_DOMAIN]?.trim();
    const tokenAuthMethod = process.env[ENV_TOKEN_AUTH_METHOD]?.trim();
    const idTokenAlg = process.env[ENV_ID_TOKEN_SIGNED_ALG]?.trim();
    const userInfoAlg = process.env[ENV_USERINFO_SIGNED_ALG]?.trim();
    const timeout = process.env[ENV_TIMEOUT]?.trim();
    const autoRegister = process.env[ENV_AUTO_REGISTER]?.trim();

    if (!issuer || !clientId || !clientSecret || !slug) {
        return null;
    }

    return {
        issuer_url: issuer.replace(/\/$/, ''),
        client_id: clientId,
        client_secret: clientSecret,
        provider_id: slug,
        display_name: name || slug,
        domain: domain || `${slug}.env`,
        logo_url: logoUrl || null,
        token_endpoint_auth_method: tokenAuthMethod || 'client_secret_post',
        signing_algorithm: idTokenAlg || 'RS256',
        profile_signing_algorithm: userInfoAlg || 'none',
        timeout: Number.parseInt(timeout, 10) || 30000,
        is_active: true,
        auto_register: autoRegister !== undefined ? autoRegister === 'true' : true,
        is_env_configured: true,
        scope: scope || 'openid email profile',
    };
}

/**
 * Upserts the env-configured OIDC provider into sso_provider and syncs Better Auth.
 * No-op if env config is incomplete. Safe to call on every startup.
 */
async function upsertEnvOidcProvider() {
    const config = getEnvOidcConfig();
    if (!config) {
        return;
    }

    const oidcProviderRepository = require('../models/oidcProviderRepository');
    const existing = await oidcProviderRepository.getOidcProviderById(config.provider_id);

    if (existing) {
        await oidcProviderRepository.updateOidcProvider(config.provider_id, config);
        log('info', `[OIDC ENV] Updated provider "${config.provider_id}" from environment.`);
    } else {
        await oidcProviderRepository.createOidcProvider(config);
        log('info', `[OIDC ENV] Created provider "${config.provider_id}" from environment.`);
    }
}

module.exports = {
    getEnvOidcConfig,
    upsertEnvOidcProvider,
};
