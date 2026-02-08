const { getSystemClient } = require('../db/poolManager');
const { log } = require('../config/logging');
// Use native fetch (available in Node 20+) status: %SAME% summary: %SAME% task_name: %SAME%
const NodeCache = require('node-cache');

const discoveryCache = new NodeCache({ stdTTL: 3600 });

/**
 * Fetches OIDC endpoints from the discovery document
 * @param {string} discoveryEndpoint - The OIDC discovery endpoint URL
 * @returns {Promise<Object>} Object containing jwksEndpoint, tokenEndpoint, authorizationEndpoint, userInfoEndpoint
 */
async function fetchOidcEndpoints(discoveryEndpoint) {
    let discoveryDocument = discoveryCache.get(discoveryEndpoint);

    if (!discoveryDocument) {
        try {
            const response = await fetch(discoveryEndpoint);
            if (response.ok) {
                discoveryDocument = await response.json();
                discoveryCache.set(discoveryEndpoint, discoveryDocument);
            } else {
                log('error', `Failed to fetch discovery document from ${discoveryEndpoint}: ${response.status}`);
                return {};
            }
        } catch (e) {
            log('error', `Error fetching discovery from ${discoveryEndpoint}:`, e);
            return {};
        }
    }

    return {
        jwksEndpoint: discoveryDocument.jwks_uri,
        tokenEndpoint: discoveryDocument.token_endpoint,
        authorizationEndpoint: discoveryDocument.authorization_endpoint,
        userInfoEndpoint: discoveryDocument.userinfo_endpoint,
    };
}

async function getOidcProviders() {
    const client = await getSystemClient();
    try {
        const result = await client.query(
            `SELECT * FROM "sso_provider" ORDER BY created_at ASC`
        );
        return result.rows.map(row => {
            const config = row.additional_config ? JSON.parse(row.additional_config) : {};
            const baseUrl = (process.env.SPARKY_FITNESS_FRONTEND_URL || "http://localhost:8080");
            return {
                id: row.id,
                provider_id: row.provider_id,
                issuer_url: row.issuer,
                domain: row.domain,
                client_id: row.client_id,
                scope: row.scopes,
                is_active: config.is_active !== undefined ? config.is_active : true,
                redirect_uris: config.redirect_uris || [],
                response_types: config.response_types || ['code'],
                token_endpoint_auth_method: config.token_endpoint_auth_method || 'client_secret_post',
                signing_algorithm: config.signing_algorithm || 'RS256',
                profile_signing_algorithm: config.profile_signing_algorithm || 'none',
                timeout: config.timeout || 30000,
                ...config,
                // Force correct redirectURI for Better Auth
                redirectURI: `${baseUrl}/api/auth/sso/callback/${row.provider_id}`
            };
        });
    } finally {
        client.release();
    }
}

async function getOidcProviderById(id) {
    const client = await getSystemClient();
    try {
        const result = await client.query(
            `SELECT * FROM "sso_provider" WHERE id::text = $1 OR provider_id = $1`,
            [id]
        );
        const row = result.rows[0];
        if (!row) return null;

        const config = row.additional_config ? JSON.parse(row.additional_config) : {};

        const baseUrl = (process.env.SPARKY_FITNESS_FRONTEND_URL || "http://localhost:8080");
        const provider = {
            id: row.id,
            provider_id: row.provider_id,
            issuer_url: row.issuer,
            domain: row.domain,
            client_id: row.client_id,
            client_secret: row.client_secret,
            scope: row.scopes,
            is_active: config.is_active !== undefined ? config.is_active : true,
            redirect_uris: config.redirect_uris || [],
            response_types: config.response_types || ['code'],
            token_endpoint_auth_method: config.token_endpoint_auth_method || 'client_secret_post',
            signing_algorithm: config.signing_algorithm || 'RS256',
            profile_signing_algorithm: config.profile_signing_algorithm || 'none',
            timeout: config.timeout || 30000,
            ...config,
            // Force correct redirectURI for Better Auth
            redirectURI: `${baseUrl}/api/auth/sso/callback/${row.provider_id}`
        };

        let endSessionEndpoint = null;
        if (provider.issuer_url) {
            const discoveryUrl = `${provider.issuer_url}/.well-known/openid-configuration`;
            let discoveryDocument = discoveryCache.get(discoveryUrl);
            if (!discoveryDocument) {
                try {
                    const response = await fetch(discoveryUrl);
                    if (response.ok) {
                        discoveryDocument = await response.json();
                        discoveryCache.set(discoveryUrl, discoveryDocument);
                    }
                } catch (e) {
                    log('error', `Repo: Error fetching discovery from ${discoveryUrl}:`, e);
                }
            }
            if (discoveryDocument) {
                endSessionEndpoint = discoveryDocument.end_session_endpoint;
            }
        }

        return {
            ...provider,
            end_session_endpoint: endSessionEndpoint
        };
    } finally {
        client.release();
    }
}

async function createOidcProvider(providerData) {
    const client = await getSystemClient();
    try {
        const config = JSON.stringify({
            display_name: providerData.display_name,
            logo_url: providerData.logo_url,
            auto_register: providerData.auto_register || false,
            is_active: providerData.is_active !== undefined ? providerData.is_active : true,
            redirect_uris: providerData.redirect_uris || [],
            response_types: providerData.response_types || ['code'],
            token_endpoint_auth_method: providerData.token_endpoint_auth_method || 'client_secret_post',
            signing_algorithm: providerData.signing_algorithm || 'RS256',
            profile_signing_algorithm: providerData.profile_signing_algorithm || 'none',
            timeout: providerData.timeout || 30000
        });

        const providerId = providerData.provider_id || `oidc-${Date.now()}`;
        const discoveryEndpoint = providerData.issuer_url + '/.well-known/openid-configuration';

        // Fetch OIDC endpoints from discovery document
        const endpoints = await fetchOidcEndpoints(discoveryEndpoint);

        // Construct native oidcConfig for Better Auth
        const baseUrl = (process.env.SPARKY_FITNESS_FRONTEND_URL || "http://localhost:8080");
        const oidcConfig = JSON.stringify({
            issuer: providerData.issuer_url,
            clientId: providerData.client_id,
            clientSecret: providerData.client_secret,
            scopes: (providerData.scope || 'openid email profile').split(' ').filter(Boolean),
            discoveryEndpoint: discoveryEndpoint,
            pkce: true,
            redirectURI: `${baseUrl}/api/auth/sso/callback/${providerId}`,
            // Add endpoints from discovery
            jwksEndpoint: endpoints.jwksEndpoint,
            tokenEndpoint: endpoints.tokenEndpoint,
            authorizationEndpoint: endpoints.authorizationEndpoint,
            userInfoEndpoint: endpoints.userInfoEndpoint,
        });

        const result = await client.query(
            `INSERT INTO "sso_provider" 
            (provider_id, issuer, domain, client_id, client_secret, scopes, discovery_endpoint, 
             authorization_endpoint, token_endpoint, jwks_endpoint, userinfo_endpoint, 
             additional_config, oidc_config)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id`,
            [
                providerId,
                providerData.issuer_url,
                providerData.domain || `${providerId}.internal`,
                providerData.client_id,
                providerData.client_secret,
                providerData.scope || 'openid email profile',
                discoveryEndpoint,
                endpoints.authorizationEndpoint,
                endpoints.tokenEndpoint,
                endpoints.jwksEndpoint,
                endpoints.userInfoEndpoint,
                config,
                oidcConfig
            ]
        );
        // Refresh Better Auth trusted providers after creation
        try {
            const { syncTrustedProviders } = require('../auth');
            await syncTrustedProviders();
        } catch (err) {
            log('error', 'Failed to refresh trusted providers after creation:', err);
        }

        return result.rows[0];
    } finally {
        client.release();
    }
}

async function updateOidcProvider(id, providerData) {
    const client = await getSystemClient();
    try {
        const existing = await getOidcProviderById(id);
        const config = JSON.stringify({
            display_name: providerData.display_name,
            logo_url: providerData.logo_url,
            auto_register: providerData.auto_register || false,
            is_active: providerData.is_active !== undefined ? providerData.is_active : true,
            redirect_uris: providerData.redirect_uris || [],
            response_types: providerData.response_types || ['code'],
            token_endpoint_auth_method: providerData.token_endpoint_auth_method || 'client_secret_post',
            signing_algorithm: providerData.signing_algorithm || 'RS256',
            profile_signing_algorithm: providerData.profile_signing_algorithm || 'none',
            timeout: providerData.timeout || 30000
        });

        const discoveryEndpoint = providerData.issuer_url + '/.well-known/openid-configuration';
        const clientSecret = (providerData.client_secret && providerData.client_secret !== '*****')
            ? providerData.client_secret
            : existing.client_secret;

        // Fetch OIDC endpoints from discovery document
        const endpoints = await fetchOidcEndpoints(discoveryEndpoint);

        // Construct native oidcConfig for Better Auth
        const baseUrl = (process.env.SPARKY_FITNESS_FRONTEND_URL || "http://localhost:8080");
        const providerIdToUse = providerData.provider_id || id;
        const oidcConfig = JSON.stringify({
            issuer: providerData.issuer_url,
            clientId: providerData.client_id,
            clientSecret: clientSecret,
            scopes: (providerData.scope || 'openid email profile').split(' ').filter(Boolean),
            discoveryEndpoint: discoveryEndpoint,
            pkce: true,
            redirectURI: `${baseUrl}/api/auth/sso/callback/${providerIdToUse}`,
            // Add endpoints from discovery
            jwksEndpoint: endpoints.jwksEndpoint,
            tokenEndpoint: endpoints.tokenEndpoint,
            authorizationEndpoint: endpoints.authorizationEndpoint,
            userInfoEndpoint: endpoints.userInfoEndpoint,
        });

        const query = `
            UPDATE "sso_provider" 
            SET issuer=$1, domain=$2, client_id=$3, client_secret=$4, scopes=$5, discovery_endpoint=$6, 
                authorization_endpoint=$7, token_endpoint=$8, jwks_endpoint=$9, userinfo_endpoint=$10,
                additional_config=$11, oidc_config=$12, provider_id=$13, updated_at=NOW() 
            WHERE id::text=$14 OR provider_id=$14
            RETURNING id`;

        const result = await client.query(query, [
            providerData.issuer_url,
            providerData.domain,
            providerData.client_id,
            clientSecret,
            providerData.scope || 'openid email profile',
            discoveryEndpoint,
            endpoints.authorizationEndpoint,
            endpoints.tokenEndpoint,
            endpoints.jwksEndpoint,
            endpoints.userInfoEndpoint,
            config,
            oidcConfig,
            providerIdToUse,
            id
        ]);

        // Refresh Better Auth trusted providers after update
        try {
            const { syncTrustedProviders } = require('../auth');
            await syncTrustedProviders();
        } catch (err) {
            log('error', 'Failed to refresh trusted providers after update:', err);
        }

        return result.rows[0];
    } finally {
        client.release();
    }
}

async function deleteOidcProvider(id) {
    const client = await getSystemClient();
    try {
        await client.query('DELETE FROM "sso_provider" WHERE id::text = $1 OR provider_id = $1', [id]);

        // Refresh Better Auth trusted providers after deletion
        try {
            const { syncTrustedProviders } = require('../auth');
            await syncTrustedProviders();
        } catch (err) {
            log('error', 'Failed to refresh trusted providers after deletion:', err);
        }
    } finally {
        client.release();
    }
}

async function getActiveOidcProviderIds() {
    const client = await getSystemClient();
    try {
        const result = await client.query('SELECT provider_id, additional_config FROM "sso_provider"');

        return result.rows.filter(row => {
            let config = row.additional_config;
            if (typeof config === 'string') {
                try {
                    config = JSON.parse(config);
                } catch (e) {
                    log('error', `Failed to parse config for ${row.provider_id}:`, e);
                    return false;
                }
            }
            // Trust if active (default to true if field is missing)
            const isActive = config && config.is_active !== false;
            return isActive;
        }).map(row => row.provider_id);
    } finally {
        client.release();
    }
}

async function setProviderLogo(id, logoUrl) {
    const client = await getSystemClient();
    try {
        const result = await client.query('SELECT additional_config FROM "sso_provider" WHERE id::text = $1', [id]);
        if (result.rows.length > 0) {
            const config = result.rows[0].additional_config ? JSON.parse(result.rows[0].additional_config) : {};
            config.logo_url = logoUrl;
            await client.query('UPDATE "sso_provider" SET additional_config = $1 WHERE id::text = $2', [JSON.stringify(config), id]);
            return true;
        }
        return false;
    } finally {
        client.release();
    }
}

module.exports = {
    getOidcProviders,
    getOidcProviderById,
    getActiveOidcProviderIds,
    createOidcProvider,
    updateOidcProvider,
    deleteOidcProvider,
    setProviderLogo,
};