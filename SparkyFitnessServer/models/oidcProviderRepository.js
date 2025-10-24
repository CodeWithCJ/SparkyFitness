const { getSystemClient } = require('../db/poolManager');
const { encrypt, decrypt, ENCRYPTION_KEY } = require('../security/encryption');
const { log } = require('../config/logging');
const fetch = require('node-fetch'); // Import node-fetch
const NodeCache = require('node-cache'); // Import node-cache for caching discovery documents

const discoveryCache = new NodeCache({ stdTTL: 3600 }); // Cache discovery documents for 1 hour

async function getOidcProviders() {
    const client = await getSystemClient(); // System-level operation
    try {
        const result = await client.query(
            `SELECT 
                id, issuer_url, client_id,
                redirect_uris, scope, token_endpoint_auth_method, response_types, is_active,
                display_name, logo_url, auto_register,
                signing_algorithm, profile_signing_algorithm, timeout
            FROM oidc_providers
            ORDER BY id ASC`
        );
        return result.rows;
    } finally {
        client.release();
    }
}

async function getOidcProviderById(id) {
    const client = await getSystemClient(); // System-level operation
    try {
        const result = await client.query(
            `SELECT 
                id, issuer_url, client_id,
                encrypted_client_secret, client_secret_iv, client_secret_tag,
                redirect_uris, scope, token_endpoint_auth_method, response_types, is_active,
                display_name, logo_url, auto_register,
                signing_algorithm, profile_signing_algorithm, timeout
            FROM oidc_providers
            WHERE id = $1`,
            [id]
        );
        const provider = result.rows[0];

        if (!provider) {
            return null;
        }

        let decryptedClientSecret = null;
        if (provider.encrypted_client_secret && provider.client_secret_iv && provider.client_secret_tag) {
            try {
                decryptedClientSecret = await decrypt(
                    provider.encrypted_client_secret,
                    provider.client_secret_iv,
                    provider.client_secret_tag,
                    ENCRYPTION_KEY
                );
            } catch (e) {
                log('error', `Error decrypting OIDC client secret for provider ${id}:`, e);
            }
        }

        // Fetch OIDC discovery document to get end_session_endpoint
        let endSessionEndpoint = null;
        if (provider.issuer_url) {
            const discoveryUrl = `${provider.issuer_url}/.well-known/openid-configuration`;
            let discoveryDocument = discoveryCache.get(discoveryUrl);

            if (!discoveryDocument) {
                try {
                    const discoveryResponse = await fetch(discoveryUrl);
                    if (discoveryResponse.ok) {
                        discoveryDocument = await discoveryResponse.json();
                        discoveryCache.set(discoveryUrl, discoveryDocument);
                    } else {
                        log('warn', `Failed to fetch OIDC discovery document from ${discoveryUrl}: ${discoveryResponse.statusText}`);
                    }
                } catch (e) {
                    log('error', `Error fetching OIDC discovery document from ${discoveryUrl}:`, e);
                }
            }

            if (discoveryDocument && discoveryDocument.end_session_endpoint) {
                endSessionEndpoint = discoveryDocument.end_session_endpoint;
            } else {
                log('warn', `end_session_endpoint not found in discovery document for ${provider.issuer_url}`);
            }
        }

        return {
            ...provider,
            client_secret: decryptedClientSecret,
            end_session_endpoint: endSessionEndpoint, // Add the discovered endpoint
        };
    } finally {
        client.release();
    }
}

async function createOidcProvider(providerData) {
    const client = await getSystemClient(); // System-level operation
    try {
        let encryptedClientSecret = null;
        let clientSecretIv = null;
        let clientSecretTag = null;

        if (providerData.client_secret) {
            const encrypted = await encrypt(providerData.client_secret, ENCRYPTION_KEY);
            encryptedClientSecret = encrypted.encryptedText;
            clientSecretIv = encrypted.iv;
            clientSecretTag = encrypted.tag;
        }

        const result = await client.query(
            `INSERT INTO oidc_providers (
                issuer_url, client_id,
                encrypted_client_secret, client_secret_iv, client_secret_tag,
                redirect_uris, scope, token_endpoint_auth_method, response_types, is_active,
                display_name, logo_url, auto_register,
                signing_algorithm, profile_signing_algorithm, timeout
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING id`,
            [
                providerData.issuer_url,
                providerData.client_id,
                encryptedClientSecret,
                clientSecretIv,
                clientSecretTag,
                providerData.redirect_uris,
                providerData.scope,
                providerData.token_endpoint_auth_method,
                providerData.response_types,
                providerData.is_active,
                providerData.display_name,
                providerData.logo_url,
                providerData.auto_register,
                providerData.signing_algorithm,
                providerData.profile_signing_algorithm,
                providerData.timeout,
            ]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function updateOidcProvider(id, providerData) {
    const client = await getSystemClient(); // System-level operation
    try {
        const existingProvider = await getOidcProviderById(id);
        if (!existingProvider) {
            throw new Error('Provider not found');
        }

        let encryptedClientSecret = existingProvider.encrypted_client_secret;
        let clientSecretIv = existingProvider.client_secret_iv;
        let clientSecretTag = existingProvider.client_secret_tag;

        if (providerData.client_secret && providerData.client_secret !== '*****') {
            const encrypted = await encrypt(providerData.client_secret, ENCRYPTION_KEY);
            encryptedClientSecret = encrypted.encryptedText;
            clientSecretIv = encrypted.iv;
            clientSecretTag = encrypted.tag;
        }

        const result = await client.query(
            `UPDATE oidc_providers SET
                issuer_url = $1, client_id = $2,
                encrypted_client_secret = $3, client_secret_iv = $4, client_secret_tag = $5,
                redirect_uris = $6, scope = $7, token_endpoint_auth_method = $8, response_types = $9, is_active = $10,
                display_name = $11, logo_url = $12, auto_register = $13,
                signing_algorithm = $14, profile_signing_algorithm = $15, timeout = $16,
                updated_at = NOW()
            WHERE id = $17
            RETURNING id`,
            [
                providerData.issuer_url,
                providerData.client_id,
                encryptedClientSecret,
                clientSecretIv,
                clientSecretTag,
                providerData.redirect_uris,
                providerData.scope,
                providerData.token_endpoint_auth_method,
                providerData.response_types,
                providerData.is_active,
                providerData.display_name,
                providerData.logo_url,
                providerData.auto_register,
                providerData.signing_algorithm,
                providerData.profile_signing_algorithm,
                providerData.timeout,
                id,
            ]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function deleteOidcProvider(id) {
    const client = await getSystemClient(); // System-level operation
    try {
        await client.query('DELETE FROM oidc_providers WHERE id = $1', [id]);
    } finally {
        client.release();
    }
}

module.exports = {
    getOidcProviders,
    getOidcProviderById,
    createOidcProvider,
    updateOidcProvider,
    deleteOidcProvider,
};