const { betterAuth } = require("better-auth");
const { APIError } = require("better-auth/api");
const { Pool } = require("pg");
console.log("[AUTH] auth.js module is being loaded...");

// Create a dedicated pool for Better Auth
/*
console.log("DEBUG: Initializing Better Auth Pool with:", {
    user: process.env.SPARKY_FITNESS_DB_USER,
    host: process.env.SPARKY_FITNESS_DB_HOST,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    port: process.env.SPARKY_FITNESS_DB_PORT || 5432,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD ? "****" : "MISSING"
});
*/

const authPool = new Pool({
    user: process.env.SPARKY_FITNESS_DB_USER,
    host: process.env.SPARKY_FITNESS_DB_HOST,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    port: process.env.SPARKY_FITNESS_DB_PORT || 5432,
});

// Persistent array reference for trusted providers
// Mutation of this array will be visible to Better Auth since it holds the reference
const dynamicTrustedProviders = [];

// Function to sync trusted providers from database
async function syncTrustedProviders() {
    try {
        // Use lazy require to avoid circular dependency with oidcProviderRepository
        const oidcProviderRepository = require('./models/oidcProviderRepository');
        const providers = await oidcProviderRepository.getActiveOidcProviderIds();

        // Update the array without changing the reference
        dynamicTrustedProviders.length = 0;
        dynamicTrustedProviders.push(...providers);

        console.log('[AUTH] Synced trusted SSO providers for auto-linking:', dynamicTrustedProviders);
        return dynamicTrustedProviders;
    } catch (error) {
        console.error('[AUTH] Error syncing trusted providers:', error);
        return dynamicTrustedProviders;
    }
}

// Initial sync on startup
syncTrustedProviders().catch(err => console.error('[AUTH] Startup sync failed:', err));

const apiKeyPlugin = require("better-auth/plugins").apiKey({
    enableSessionForAPIKeys: true, // Required for getSession to work with API Keys
    schema: {
        apikey: {
            modelName: "api_key",
            fields: {
                id: "id",
                name: "name",
                key: "key",
                userId: "user_id",
                token: "key", // Better Auth sometimes looks for 'token'
                metadata: "metadata",
                createdAt: "created_at",
                updatedAt: "updated_at",
                expiresAt: "expires_at",
                start: "start",
                prefix: "prefix",
                refillInterval: "refill_interval",
                refillAmount: "refill_amount",
                lastRefillAt: "last_refill_at",
                enabled: "enabled",
                rateLimitEnabled: "rate_limit_enabled",
                rateLimitTimeWindow: "rate_limit_time_window",
                rateLimitMax: "rate_limit_max",
                requestCount: "request_count",
                remaining: "remaining",
                lastRequest: "last_request",
                permissions: "permissions",
            }
        }
    }
});

// FIX: Better Auth v1.4.17 is missing paths for these endpoints in the library definition.
// We patch the plugin instance BEFORE passing it to betterAuth so the internal router picks it up.
if (apiKeyPlugin.endpoints) {
    if (apiKeyPlugin.endpoints.deleteAllExpiredApiKeys) {
        apiKeyPlugin.endpoints.deleteAllExpiredApiKeys.path = "/api-key/delete-all-expired-api-keys";
        apiKeyPlugin.endpoints.deleteAllExpiredApiKeys.method = "POST";
    }
    if (apiKeyPlugin.endpoints.verifyApiKey) {
        apiKeyPlugin.endpoints.verifyApiKey.path = "/api-key/verify";
        apiKeyPlugin.endpoints.verifyApiKey.method = "POST";
    }
}

const auth = betterAuth({
    database: authPool,
    secret: Buffer.from(process.env.BETTER_AUTH_SECRET, 'base64'),


    // Base URL configuration - MUST use public frontend URL for OIDC to work
    baseURL: (process.env.SPARKY_FITNESS_FRONTEND_URL?.startsWith("http") ? process.env.SPARKY_FITNESS_FRONTEND_URL : `https://${process.env.SPARKY_FITNESS_FRONTEND_URL}`)?.replace(/\/$/, '') + "/api/auth",

    onAPIError: {
        errorURL: new URL('/error', (process.env.SPARKY_FITNESS_FRONTEND_URL?.startsWith("http") ? process.env.SPARKY_FITNESS_FRONTEND_URL : `https://${process.env.SPARKY_FITNESS_FRONTEND_URL}`)?.replace(/\/$/, '') + '/').toString(),
    },

    basePath: "/api/auth",

    // Email/Password authentication
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
        sendResetPassword: async ({ user, url }, request) => {
            const { sendPasswordResetEmail } = require("./services/emailService");
            await sendPasswordResetEmail(user.email, url);
        },
        password: {
            // Use bcrypt for compatibility with existing hashes
            hash: async (password) => {
                const bcrypt = require("bcrypt");
                return await bcrypt.hash(password, 10);
            },
            verify: async ({ password, hash }) => {
                const bcrypt = require("bcrypt");
                return await bcrypt.compare(password, hash);
            },
        },
    },

    // Session configuration
    session: {
        expiresIn: 60 * 60 * 24 * 30, // 30 days 
        updateAge: 60 * 60 * 24, // Update session every 24 hours
        cookieCache: {
            enabled: false, // Disabled to prevent stale data after manual DB updates
        },
    },

    // Advanced session options
    advanced: {
        cookiePrefix: "sparky",
        useSecureCookies: process.env.SPARKY_FITNESS_FRONTEND_URL?.startsWith("https"),
        trustProxy: true,
        crossSubDomainCookies: {
            enabled: false,
        },
        database: {
            generateId: () => require("uuid").v4(),
        },
    },


    user: {
        fields: {
            id: "id",
            emailVerified: "email_verified",
            twoFactorEnabled: "two_factor_enabled",
            banned: "banned",
            banReason: "ban_reason",
            banExpires: "ban_expires",
            createdAt: "created_at",
            updatedAt: "updated_at",
        },
        additionalFields: {
            twoFactorEnabled: {
                type: "boolean",
                fieldName: "two_factor_enabled",
                required: false,
                defaultValue: false,
                returned: true
            },
            mfaEmailEnabled: {
                type: "boolean",
                fieldName: "mfa_email_enabled",
                required: false,
                defaultValue: false,
                returned: true
            }
        }
    },
    session: {
        fields: {
            id: "id",
            userId: "user_id",
            expiresAt: "expires_at",
            ipAddress: "ip_address",
            userAgent: "user_agent",
            createdAt: "created_at",
            updatedAt: "updated_at",
        }
    },
    account: {
        accountLinking: {
            enabled: true,
            // Use a getter to ensure Better Auth always checks the current state of our dynamic list
            get trustedProviders() {
                console.log(`[AUTH DEBUG] Better Auth is checking trustedProviders. Current list:`, dynamicTrustedProviders);
                return dynamicTrustedProviders;
            }
        },
        fields: {
            id: "id",
            userId: "user_id",
            accountId: "account_id",
            providerId: "provider_id",
            accessToken: "access_token",
            refreshToken: "refresh_token",
            idToken: "id_token",
            accessTokenExpiresAt: "access_token_expires_at",
            refreshTokenExpiresAt: "refresh_token_expires_at",
            scope: "scope",
            password: "password",
            createdAt: "created_at",
            updatedAt: "updated_at",
        }
    },
    verification: {
        fields: {
            id: "id",
            expiresAt: "expires_at",
            createdAt: "created_at",
            updatedAt: "updated_at",
        }
    },

    // Trust proxy (for Docker/Nginx deployments)
    trustedOrigins: [
        process.env.SPARKY_FITNESS_FRONTEND_URL,
    ].filter(Boolean).map(url => url.replace(/\/$/, '')),

    databaseHooks: {
        user: {
            create: {
                before: async (user, ctx) => {
                    console.log(`[AUTH DEBUG] user.create.before hook triggered. Path: ${ctx.path}`);

                    // 1. MASTER TOGGLE: Global signup blockade
                    if (process.env.SPARKY_FITNESS_DISABLE_SIGNUP === 'true') {
                        console.log("[AUTH] Blocking signup: SPARKY_FITNESS_DISABLE_SIGNUP is true");
                        throw new APIError("BAD_REQUEST", {
                            message: "Signups are currently disabled by the administrator.",
                        });
                    }

                    // 2. PER-PROVIDER TOGGLE: SSO auto_register check
                    // SSO callback paths are /sso/callback/[providerId]
                    if (ctx.path.includes("/sso/callback/")) {
                        // Better Auth might use :providerId in ctx.path, so we check ctx.params or the request URL
                        let providerId = ctx.params?.providerId;

                        // Fallback: Extract from the actual request URL if template is used in ctx.path
                        if (!providerId || providerId === ":providerId") {
                            const url = new URL(ctx.request.url, "http://localhost");
                            const pathParts = url.pathname.split("/");
                            providerId = pathParts[pathParts.length - 1];
                        }

                        console.log(`[AUTH] Verifying auto-register for SSO provider: ${providerId} (Original Path: ${ctx.path})`);

                        try {
                            const oidcProviderRepository = require("./models/oidcProviderRepository");
                            const provider = await oidcProviderRepository.getOidcProviderById(providerId);

                            if (provider) {
                                console.log(`[AUTH DEBUG] Provider found: ${provider.provider_id}. auto_register: ${provider.auto_register} (Type: ${typeof provider.auto_register})`);
                            } else {
                                console.log(`[AUTH DEBUG] No provider found in DB for ID: ${providerId}`);
                            }

                            if (provider && provider.auto_register === false) {
                                console.log(`[AUTH] Blocking SSO registration: auto_register is disabled for ${providerId}`);
                                throw new APIError("BAD_REQUEST", {
                                    message: "New account registration is disabled for this login provider.",
                                });
                            }
                        } catch (error) {
                            // Re-throw APIErrors, log others
                            if (error instanceof APIError) throw error;
                            console.error("[AUTH] Error during auto_register check:", error);
                        }
                    }

                    return { data: user };
                },
                after: async (user) => {
                    console.log(`[AUTH] Hook: User created, initializing Sparky data for ${user.id}`);
                    try {
                        const { ensureUserInitialization } = require("./models/userRepository");
                        // We use the user.name or email if name is missing for the profile
                        await ensureUserInitialization(user.id, user.name || user.email.split('@')[0]);

                        // Also initialize default nutrient preferences
                        const { createDefaultNutrientPreferencesForUser } = require("./services/nutrientDisplayPreferenceService");
                        await createDefaultNutrientPreferencesForUser(user.id);

                        console.log(`[AUTH] Hook: Initialization complete for ${user.id}`);
                    } catch (error) {
                        console.error(`[AUTH] Hook Error: Failed to initialize user ${user.id}:`, error);
                        // We don't throw here to avoid blocking the signup, but we log the failure
                    }
                }
            }
        },
        account: {
            create: {
                before: async (account, ctx) => {
                    console.log(`[AUTH DEBUG] account.create.before hook triggered`);
                    console.log(`[AUTH DEBUG] Account data:`, JSON.stringify({
                        providerId: account.providerId,
                        accountId: account.accountId,
                        userId: account.userId,
                        path: ctx.path
                    }));
                    return { data: account };
                },
                after: async (account) => {
                    console.log(`[AUTH DEBUG] account.create.after hook - Account link created successfully`);
                    console.log(`[AUTH DEBUG] Created account:`, JSON.stringify({
                        id: account.id,
                        providerId: account.providerId,
                        userId: account.userId
                    }));
                }
            }
        }
    },

    plugins: [
        require("better-auth/plugins").magicLink({
            expiresIn: 900, // 15 minutes (matches email template)
            sendMagicLink: async ({ email, url, token }, request) => {
                const { sendMagicLinkEmail } = require("./services/emailService");
                await sendMagicLinkEmail(email, url);
            },
        }),
        require("better-auth/plugins").admin(),
        require("better-auth/plugins").twoFactor({
            issuer: process.env.NODE_ENV === 'production' ? 'SparkyFitness' : 'SparkyFitnessDev',
            schema: {
                twoFactor: {
                    modelName: "two_factor",
                    fields: {
                        id: "id",
                        userId: "user_id",
                        secret: "secret",
                        backupCodes: "backup_codes",
                        createdAt: "created_at",
                        updatedAt: "updated_at",
                    }
                }
            },
            otpOptions: {
                async sendOTP({ user, otp }, request) {
                    const { sendEmailMfaCode } = require("./services/emailService");
                    await sendEmailMfaCode(user.email, otp);
                }
            }
        }),
        require("@better-auth/sso").sso({
            modelName: "sso_provider", // Map to my snake_case table
            trustEmailVerified: true, // Trust that OIDC provider emails are verified
            disableImplicitSignUp: false, // Allow implicit sign-up for OIDC users
            fields: {
                id: "id",
                providerId: "provider_id",
                issuer: "issuer",
                oidcConfig: "oidc_config", // Added this mapping
                samlConfig: "saml_config", // Added this mapping
                domain: "domain",
                additionalConfig: "additional_config",
                createdAt: "created_at",
                updatedAt: "updated_at",
            }
        }),
        require("@better-auth/passkey").passkey({
            schema: {
                passkey: {
                    modelName: "passkey",
                    fields: {
                        id: "id",
                        name: "name",
                        publicKey: "public_key",
                        userId: "user_id",
                        credentialID: "credential_id",
                        counter: "counter",
                        deviceType: "device_type",
                        backedUp: "backed_up",
                        transports: "transports",
                        createdAt: "created_at",
                        aaguid: "aaguid",
                    }
                }
            }
        }),
        apiKeyPlugin
    ]
});

/**
 * Proactive session cleanup
 * Deletes expired sessions from the database to maintain performance.
 * Better Auth doesn't do this automatically on every request for performance reasons.
 */
async function cleanupSessions() {
    console.log("[AUTH] Running proactive session cleanup...");
    const client = await authPool.connect();
    try {
        const result = await client.query('DELETE FROM "session" WHERE expires_at < NOW()');
        console.log(`[AUTH] Cleanup complete. Removed ${result.rowCount} expired sessions.`);
        return result.rowCount;
    } catch (error) {
        console.error("[AUTH] Session cleanup failed:", error);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { auth, syncTrustedProviders, cleanupSessions };
