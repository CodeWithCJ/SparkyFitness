const { betterAuth } = require('better-auth');

const { APIError } = require('better-auth/api');
const { Pool } = require('pg');
const { log } = require('./config/logging');
const bcrypt = require('bcrypt');
const { syncUserGroups } = require('./utils/oidcGroupSync');
const userRepository = require('./models/userRepository');
const { resolveTwoFactorDisableUserUpdate } = require('./utils/twoFactorState');
const {
  sendPasswordResetEmail,
  sendMagicLinkEmail,
  sendEmailMfaCode,
} = require('./services/emailService');
const {
  createDefaultNutrientPreferencesForUser,
} = require('./services/nutrientDisplayPreferenceService');
/**
 * Gathers and cleans origins from environment variables.
 * @returns {string[]} An array of cleaned origin strings.
 */
function getBaseTrustedOrigins() {
  const primary = process.env.SPARKY_FITNESS_FRONTEND_URL;
  const rawExtras = process.env.SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS;
  const origins = [primary];

  if (rawExtras) {
    const extras = rawExtras.split(',').map((o) => o.trim());
    origins.push(...extras);
  }

  return [...new Set(origins)]
    .filter(Boolean)
    .map((url) => url.replace(/\/$/, ''));
}

/**
 * Extracts Origin and Referer headers consistently across different Better Auth request objects.
 * @param {Request|Object} request - The incoming request object.
 * @returns {{origin: string|null, referer: string|null}}
 */
function extractRequestHeaders(request) {
  const getHeader = (name) =>
    typeof request?.headers?.get === 'function'
      ? request.headers.get(name)
      : request?.headers?.[name];

  return {
    origin: getHeader('origin') || null,
    referer: getHeader('referer') || null,
  };
}

const { isPrivateNetworkAddress } = require('./utils/corsHelper');

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

    console.log(
      '[AUTH] Synced trusted SSO providers for auto-linking:',
      dynamicTrustedProviders
    );
    return dynamicTrustedProviders;
  } catch (error) {
    console.error('[AUTH] Error syncing trusted providers:', error);
    return dynamicTrustedProviders;
  }
}

// Initial sync on startup - deferred to SparkyFitnessServer.js after migrations
// syncTrustedProviders().catch(err => console.error('[AUTH] Startup sync failed:', err));

const apiKeyPlugin = require('@better-auth/api-key').apiKey({
  enableSessionForAPIKeys: true, // Required for getSession to work with API Keys
  rateLimit: {
    enabled: true,
    timeWindow:
      Number.parseInt(
        process.env.SPARKY_FITNESS_API_KEY_RATELIMIT_WINDOW_MS,
        10
      ) || 60_000, // 1 minute
    maxRequests:
      Number.parseInt(
        process.env.SPARKY_FITNESS_API_KEY_RATELIMIT_MAX_REQUESTS,
        10
      ) || 100, // 100 req/min (Better Auth defaults to 10/day)
  },
  schema: {
    apikey: {
      modelName: 'api_key',
      fields: {
        id: 'id',
        name: 'name',
        key: 'key',
        referenceId: 'reference_id',
        configId: 'config_id',
        token: 'key', // Better Auth sometimes looks for 'token'
        metadata: 'metadata',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        expiresAt: 'expires_at',
        start: 'start',
        prefix: 'prefix',
        refillInterval: 'refill_interval',
        refillAmount: 'refill_amount',
        lastRefillAt: 'last_refill_at',
        enabled: 'enabled',
        rateLimitEnabled: 'rate_limit_enabled',
        rateLimitTimeWindow: 'rate_limit_time_window',
        rateLimitMax: 'rate_limit_max',
        requestCount: 'request_count',
        remaining: 'remaining',
        lastRequest: 'last_request',
        permissions: 'permissions',
      },
    },
  },
});

const auth = betterAuth({
  database: authPool,
  secret: Buffer.from(process.env.BETTER_AUTH_SECRET, 'base64'),
  secrets: [
    {
      version: 1,
      value: Buffer.from(process.env.BETTER_AUTH_SECRET, 'base64'),
    },
  ],

  // Base URL configuration - MUST use public frontend URL for OIDC to work
  baseURL:
    process.env.BETTER_AUTH_URL ||
    (process.env.SPARKY_FITNESS_FRONTEND_URL?.startsWith('http')
      ? process.env.SPARKY_FITNESS_FRONTEND_URL
      : `https://${process.env.SPARKY_FITNESS_FRONTEND_URL}`
    )?.replace(/\/$/, '') + '/api/auth',

  onAPIError: {
    errorURL: new URL(
      '/error',
      (process.env.SPARKY_FITNESS_FRONTEND_URL?.startsWith('http')
        ? process.env.SPARKY_FITNESS_FRONTEND_URL
        : `https://${process.env.SPARKY_FITNESS_FRONTEND_URL}`
      )?.replace(/\/$/, '') + '/'
    ).toString(),
  },

  basePath: '/api/auth',

  // Rate limiting for auth endpoints
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
  },

  // Email/Password authentication
  emailAndPassword: {
    enabled: process.env.SPARKY_FITNESS_DISABLE_EMAIL_LOGIN !== 'true',
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, url);
    },
    password: {
      // Use bcrypt for compatibility with existing hashes
      hash: async (password) => {
        return await bcrypt.hash(password, 10);
      },
      verify: async ({ password, hash }) => {
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
    fields: {
      id: 'id',
      userId: 'user_id',
      expiresAt: 'expires_at',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  // Advanced session options
  advanced: {
    cookiePrefix: 'sparky',
    // DROP SECURE FLAG if private network access is enabled (typically for local IP access over HTTP)
    // DROP SECURE FLAG if private network access is enabled OR if we trust an HTTP IP (Fixes browser cookie rejection on IPs)
    useSecureCookies:
      process.env.ALLOW_PRIVATE_NETWORK_CORS === 'true' ||
      process.env.SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS?.includes('http://')
        ? false
        : process.env.SPARKY_FITNESS_FRONTEND_URL?.startsWith('https'),
    trustProxy: true,
    crossSubDomainCookies: {
      enabled: false,
    },
    database: {
      generateId: () => require('uuid').v4(),
    },
  },

  user: {
    fields: {
      id: 'id',
      emailVerified: 'email_verified',
      twoFactorEnabled: 'two_factor_enabled',
      banned: 'banned',
      banReason: 'ban_reason',
      banExpires: 'ban_expires',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    changeEmail: {
      enabled: true,
      requireVerification: true,
    },
    additionalFields: {
      mfaTotpEnabled: {
        type: 'boolean',
        fieldName: 'mfa_totp_enabled',
        required: false,
        defaultValue: false,
        returned: true,
      },
      mfaEmailEnabled: {
        type: 'boolean',
        fieldName: 'mfa_email_enabled',
        required: false,
        defaultValue: false,
        returned: true,
      },
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      // Use a getter to ensure Better Auth always checks the current state of our dynamic list
      get trustedProviders() {
        log(
          'debug',
          '[AUTH] Checking trustedProviders for linkable SSO. Current list:',
          dynamicTrustedProviders
        );
        return dynamicTrustedProviders;
      },
    },
    fields: {
      id: 'id',
      userId: 'user_id',
      accountId: 'account_id',
      providerId: 'provider_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      idToken: 'id_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      refreshTokenExpiresAt: 'refresh_token_expires_at',
      scope: 'scope',
      password: 'password',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  verification: {
    fields: {
      id: 'id',
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  // Trust proxy (for Docker/Nginx deployments)
  // NOTE: Better Auth calls this with the raw Request object directly (not a context wrapper)
  trustedOrigins: (request) => {
    const cleanOrigins = getBaseTrustedOrigins();
    const { origin: originHeader, referer: refererHeader } =
      extractRequestHeaders(request);

    // Identify if this is a non-primary origin (IP, extra domain, etc.) or null
    const primaryUrl = process.env.SPARKY_FITNESS_FRONTEND_URL;
    const isExtraOrigin =
      (originHeader && !originHeader.includes(primaryUrl)) ||
      (refererHeader && !refererHeader.includes(primaryUrl)) ||
      originHeader === 'null';

    if (isExtraOrigin) {
      log(
        'debug',
        `[AUTH] Verifying Origin: ${originHeader}, Referer: ${refererHeader}`
      );
    }

    // 1. Primary Check: If Origin is missing/null (HTTPS -> HTTP call), trust based on Referer
    if (!originHeader || originHeader === 'null') {
      if (refererHeader) {
        try {
          const refOrigin = new URL(refererHeader).origin;
          if (cleanOrigins.includes(refOrigin)) {
            if (isExtraOrigin) {
              log(
                'debug',
                `[AUTH] Allowing request via Trusted Referer: ${refOrigin}`
              );
            }
            return [...cleanOrigins, originHeader, refOrigin].filter(Boolean);
          }
        } catch (e) {
          /* invalid referer */
        }
      }
    }

    // 2. Private Network Check (if enabled)
    const isPrivateEnabled = process.env.ALLOW_PRIVATE_NETWORK_CORS === 'true';
    if (isPrivateEnabled) {
      const target =
        originHeader && originHeader !== 'null' ? originHeader : refererHeader;
      if (target) {
        try {
          const url = new URL(target);
          if (isPrivateNetworkAddress(url.hostname)) {
            if (isExtraOrigin) {
              log(
                'debug',
                `[AUTH] Allowing Private Network Origin: ${url.origin}`
              );
            }
            return [...cleanOrigins, originHeader, url.origin].filter(Boolean);
          }
        } catch (e) {
          /* invalid url */
        }
      }
    }

    if (isExtraOrigin && originHeader && !cleanOrigins.includes(originHeader)) {
      log('warn', `[AUTH] Rejecting Untrusted Origin: ${originHeader}`);
    }

    return cleanOrigins;
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          log(
            'debug',
            `[AUTH] user.create.before hook triggered. Path: ${ctx.path}`
          );

          // 1. MASTER TOGGLE: Global signup blockade
          if (process.env.SPARKY_FITNESS_DISABLE_SIGNUP === 'true') {
            log(
              'info',
              '[AUTH] Blocking signup: SPARKY_FITNESS_DISABLE_SIGNUP is true'
            );
            throw new APIError('BAD_REQUEST', {
              message: 'Signups are currently disabled by the administrator.',
            });
          }

          // 2. PER-PROVIDER TOGGLE: SSO auto_register check
          // SSO callback paths are /sso/callback/[providerId]
          if (ctx.path.includes('/sso/callback/')) {
            // Better Auth might use :providerId in ctx.path, so we check ctx.params or the request URL
            let providerId = ctx.params?.providerId;

            // Fallback: Extract from the actual request URL if template is used in ctx.path
            if (!providerId || providerId === ':providerId') {
              const url = new URL(ctx.request.url, 'http://localhost');
              const pathParts = url.pathname.split('/');
              providerId = pathParts[pathParts.length - 1];
            }

            log(
              'info',
              `[AUTH] Verifying auto-register for SSO provider: ${providerId} (Original Path: ${ctx.path})`
            );

            try {
              const oidcProviderRepository = require('./models/oidcProviderRepository');
              const provider =
                await oidcProviderRepository.getOidcProviderById(providerId);

              if (provider) {
                log(
                  'debug',
                  `[AUTH] Provider found: ${provider.provider_id}. auto_register: ${provider.auto_register} (Type: ${typeof provider.auto_register})`
                );
              } else {
                log(
                  'debug',
                  `[AUTH] No provider found in DB for ID: ${providerId}`
                );
              }

              if (provider && provider.auto_register === false) {
                log(
                  'info',
                  `[AUTH] Blocking SSO registration: auto_register is disabled for ${providerId}`
                );
                throw new APIError('BAD_REQUEST', {
                  message:
                    'New account registration is disabled for this login provider.',
                });
              }
            } catch (error) {
              // Re-throw APIErrors, log others
              if (error instanceof APIError) throw error;
              log('error', '[AUTH] Error during auto_register check:', error);
            }
          }

          return { data: user };
        },
        after: async (user) => {
          log(
            'info',
            `[AUTH] Hook: User created, initializing Sparky data for ${user.id}`
          );
          try {
            // We use the user.name or email if name is missing for the profile
            await userRepository.ensureUserInitialization(
              user.id,
              user.name || user.email.split('@')[0],
              user.image
            );

            // Also initialize default nutrient preferences
            await createDefaultNutrientPreferencesForUser(user.id);

            log('info', `[AUTH] Hook: Initialization complete for ${user.id}`);
          } catch (error) {
            log(
              'error',
              `[AUTH] Hook Error: Failed to initialize user ${user.id}:`,
              error
            );
            // We don't throw here to avoid blocking the signup, but we log the failure
          }
        },
      },
      update: {
        before: async (user, ctx) => {
          const data = await resolveTwoFactorDisableUserUpdate(
            user,
            ctx,
            userRepository.findUserById
          );

          if (!data) {
            return;
          }

          log(
            'info',
            '[AUTH] Preserving email MFA while Better Auth disables TOTP.'
          );
          return { data };
        },
      },
    },
    account: {
      create: {
        before: async (account, ctx) => {
          log('debug', '[AUTH] account.create.before hook triggered');
          log(
            'debug',
            '[AUTH] Account data:',
            JSON.stringify({
              providerId: account.providerId,
              accountId: account.accountId,
              userId: account.userId,
              path: ctx.path,
            })
          );
          return { data: account };
        },
        after: async (account) => {
          log(
            'debug',
            '[AUTH] account.create.after hook - Account link created successfully'
          );
          log(
            'debug',
            '[AUTH] Created account:',
            JSON.stringify({
              id: account.id,
              providerId: account.providerId,
              userId: account.userId,
            })
          );
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          log(
            'info',
            `[AUTH] Hook: Session created for user ${session.userId}. Checking group sync.`
          );
          try {
            const oidcProviderRepository = require('./models/oidcProviderRepository');

            // Get all accounts for this user to find the OIDC provider used
            const client = await authPool.connect();
            try {
              const { rows: accounts } = await client.query(
                'SELECT provider_id FROM "account" WHERE user_id = $1 AND provider_id LIKE \'oidc-%\'',
                [session.userId]
              );

              for (const acc of accounts) {
                const providerId = acc.provider_id.replace('oidc-', '');
                const provider =
                  await oidcProviderRepository.getOidcProviderById(providerId);

                if (provider && provider.admin_group) {
                  log(
                    'info',
                    `[AUTH] Syncing groups for user ${session.userId} using provider ${providerId} (Admin Group: ${provider.admin_group})`
                  );
                  await syncUserGroups(
                    { pool: authPool, userRepository, oidcProviderRepository },
                    session.userId,
                    provider.admin_group
                  );
                }
              }
            } finally {
              client.release();
            }
          } catch (error) {
            log(
              'error',
              `[AUTH] Hook Error: Group sync failed for session ${session.id}:`,
              error
            );
          }
        },
      },
    },
  },

  plugins: [
    require('better-auth/plugins').emailOTP({
      async sendVerificationOTP({ user, otp }) {
        await sendEmailMfaCode(user.email, otp);
      },
    }),
    require('better-auth/plugins').magicLink({
      expiresIn: 900, // 15 minutes (matches email template)
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail(email, url);
      },
    }),
    require('better-auth/plugins').admin(),
    require('better-auth/plugins').twoFactor({
      issuer:
        process.env.NODE_ENV === 'production'
          ? 'SparkyFitness'
          : 'SparkyFitnessDev',
      schema: {
        user: {
          fields: {
            twoFactorEnabled: 'two_factor_enabled',
          },
        },
        twoFactor: {
          modelName: 'two_factor',
          fields: {
            id: 'id',
            userId: 'user_id',
            secret: 'secret',
            backupCodes: 'backup_codes',
            createdAt: 'created_at',
            updatedAt: 'updated_at',
          },
        },
      },
      otpOptions: {
        async sendOTP({ user, otp }) {
          await sendEmailMfaCode(user.email, otp);
        },
      },
    }),
    require('@better-auth/sso').sso({
      modelName: 'sso_provider', // Map to my snake_case table
      trustEmailVerified: true, // Trust that OIDC provider emails are verified
      disableImplicitSignUp: false, // Allow implicit sign-up for OIDC users
      fields: {
        id: 'id',
        providerId: 'provider_id',
        issuer: 'issuer',
        oidcConfig: 'oidc_config', // Added this mapping
        samlConfig: 'saml_config', // Added this mapping
        domain: 'domain',
        additionalConfig: 'additional_config',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    }),
    require('@better-auth/passkey').passkey({
      schema: {
        passkey: {
          modelName: 'passkey',
          fields: {
            id: 'id',
            name: 'name',
            publicKey: 'public_key',
            userId: 'user_id',
            credentialID: 'credential_id',
            counter: 'counter',
            deviceType: 'device_type',
            backedUp: 'backed_up',
            transports: 'transports',
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            aaguid: 'aaguid',
          },
        },
      },
    }),
    apiKeyPlugin,
  ],
});

/**
 * Proactive session cleanup
 * Deletes expired sessions from the database to maintain performance.
 * Better Auth doesn't do this automatically on every request for performance reasons.
 */
async function cleanupSessions() {
  log('info', '[AUTH] Running proactive session cleanup...');
  const client = await authPool.connect();
  try {
    const result = await client.query(
      'DELETE FROM "session" WHERE expires_at < NOW()'
    );
    log(
      'info',
      `[AUTH] Cleanup complete. Removed ${result.rowCount} expired sessions.`
    );
    return result.rowCount;
  } catch (error) {
    log('error', '[AUTH] Session cleanup failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { auth, syncTrustedProviders, cleanupSessions };
