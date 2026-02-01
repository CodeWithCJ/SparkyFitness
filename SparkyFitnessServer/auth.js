const { betterAuth } = require("better-auth");
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

const auth = betterAuth({
    database: authPool,
    secret: Buffer.from(process.env.BETTER_AUTH_SECRET || "default_dev_secret_CHANGE_ME", 'base64'),


    // Base URL configuration - MUST use public frontend URL for OIDC to work
    baseURL: (process.env.SPARKY_FITNESS_FRONTEND_URL?.replace(/\/$/, '') || "http://localhost:8080") + "/auth",

    onAPIError: {
        errorURL: new URL('/error', (process.env.SPARKY_FITNESS_FRONTEND_URL || "http://localhost:8080").replace(/\/$/, '') + '/').toString(),
    },

    basePath: "/auth",

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
        useSecureCookies: true,
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
            // Include OIDC provider IDs that should be trusted for automatic account linking
            trustedProviders: ["oidc-1769396938049"],
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
            disableImplicitSignUp: true, // Force frontend to explicitly request sign-up
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
        require("better-auth/plugins").apiKey(),
    ]
});

module.exports = { auth };
