import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from '../../config/logging.js';
import globalSettingsRepository from '../../models/globalSettingsRepository.js';
import oidcProviderRepository from '../../models/oidcProviderRepository.js';
import userRepository from '../../models/userRepository.js';
import authModule from '../../auth.js';
import { fromNodeHeaders } from 'better-auth/node';
import { bridgeBearerAuthHeader } from '../../utils/bearerAuthBridge.js';
import {
  mintRegistrationTicket,
  redeemRegistrationTicket,
} from '../../services/passkeyTicketService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
// Inline rate limiter for the /mfa-factors endpoint to prevent account enumeration.
// This endpoint reveals whether an email has an account, so it needs tighter limits
// than the global 100/min. Better Auth's rate limiter doesn't apply here because
// this route bypasses the betterAuthHandler.
const mfaFactorsRateLimit = (() => {
  const hits = new Map();
  const MAX = 5;
  const WINDOW_MS = 30 * 1000;
  let lastSweepAt = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function evictExpired(now: any) {
    for (const [ip, entry] of hits) {
      if (now - entry.start >= WINDOW_MS) hits.delete(ip);
    }
    lastSweepAt = now;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req: any, res: any, next: any) => {
    const ip = req.ip;
    const now = Date.now();
    // Sweep at most once per window to avoid O(n) cleanup on every request.
    if (hits.size > 0 && now - lastSweepAt >= WINDOW_MS) {
      evictExpired(now);
    }
    const entry = hits.get(ip);
    if (!entry) {
      hits.set(ip, { start: now, count: 1 });
      return next();
    }
    if (entry.count < MAX) {
      entry.count++;
      return next();
    }
    const retryAfter = Math.ceil((entry.start + WINDOW_MS - now) / 1000);
    res.set('X-Retry-After', String(retryAfter));
    return res
      .status(429)
      .json({ message: 'Too many requests. Please try again later.' });
  };
})();
/**
 * @swagger
 * /auth/settings:
 *   get:
 *     summary: Get public authentication settings and available OIDC providers
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Login settings and OIDC providers
 */
router.get('/settings', async (req, res) => {
  try {
    const [globalSettings, providers] = await Promise.all([
      globalSettingsRepository.getGlobalSettings(),
      oidcProviderRepository.getOidcProviders(),
    ]);
    let trustedOrigin = null;
    if (process.env.SPARKY_FITNESS_FRONTEND_URL) {
      try {
        trustedOrigin = new URL(
          process.env.SPARKY_FITNESS_FRONTEND_URL.startsWith('http')
            ? process.env.SPARKY_FITNESS_FRONTEND_URL
            : `https://${process.env.SPARKY_FITNESS_FRONTEND_URL}`
        ).origin;
      } catch {
        log(
          'warn',
          `[AUTH CORE] Invalid frontend URL for trusted origin: ${process.env.SPARKY_FITNESS_FRONTEND_URL}`
        );
      }
    }
    // Environment overrides are now handled within globalSettingsRepository.getGlobalSettings()
    const oidcAutoRedirectEnv =
      process.env.SPARKY_FITNESS_OIDC_AUTO_REDIRECT === 'true';
    const signupDisabled = process.env.SPARKY_FITNESS_DISABLE_SIGNUP === 'true';
    const emailEnabled = globalSettings.enable_email_password_login;
    const oidcEnabled = globalSettings.is_oidc_active;
    const activeProviders = providers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((p: any) => p.is_active)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any) => ({
        // Match what navigate uses
        id: p.provider_id,

        display_name: p.display_name || p.provider_id,
        logo_url: p.logo_url,

        // Expose the flag
        auto_register: p.auto_register,
      }));
    res.json({
      trusted_origin: trustedOrigin,
      email: {
        enabled: emailEnabled,
      },
      oidc: {
        enabled: oidcEnabled,
        providers: activeProviders,
        auto_redirect: oidcAutoRedirectEnv,
      },
      signup_disabled: signupDisabled,
    });
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `[AUTH CORE] Settings Error: ${error.message}`);
    // Fallback safety, considering potential env override
    const forceEmailLogin =
      process.env.SPARKY_FITNESS_FORCE_EMAIL_LOGIN === 'true';
    const disableEmailLogin =
      process.env.SPARKY_FITNESS_DISABLE_EMAIL_LOGIN === 'true';
    res.json({
      trusted_origin: null,
      email: { enabled: forceEmailLogin || !disableEmailLogin },
      oidc: {
        enabled: process.env.SPARKY_FITNESS_OIDC_AUTH_ENABLED === 'true',
        providers: [],
        auto_redirect: false,
      },
    });
  }
});
/**
 * @swagger
 * /auth/mfa-factors:
 *   get:
 *     summary: Get enabled MFA factors for a user by email
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Enabled MFA factors
 *       400:
 *         description: Email is required
 */
router.get('/mfa-factors', mfaFactorsRateLimit, async (req, res) => {
  const { email } = req.query;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }
  try {
    const user = await userRepository.findUserByEmail(email);
    if (!user) {
      return res.json({ mfa_totp_enabled: false, mfa_email_enabled: false });
    }
    res.json({
      mfa_totp_enabled: user.mfa_totp_enabled || false,
      mfa_email_enabled: user.mfa_email_enabled || false,
    });
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `[AUTH CORE] MFA Factors Error: ${error.message}`);
    res.json({
      mfa_totp_enabled: true,
      mfa_email_enabled: false,
    });
  }
});

// --- Browser-Based Passkey Web Bridge Routes ---

// Self-hosted @simplewebauthn/browser bundle so the passkey pages have no CDN
// dependency (works offline / on air-gapped servers and can't be swapped by a
// third party). Kept in sync with @simplewebauthn/server via the vendored file.
router.get('/web-login/simplewebauthn-browser.umd.min.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(
    path.join(__dirname, 'templates', 'simplewebauthn-browser.umd.min.js')
  );
});

router.get('/web-login/passkey', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'passkey-login.html'));
});

router.get('/web-login/register-passkey', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'passkey-register.html'));
});

// Per-IP rate limiter factory (sliding fixed window), mirroring mfaFactorsRateLimit.
function makeIpRateLimit(max: number, windowMs: number) {
  const hits = new Map<string, { start: number; count: number }>();
  let lastSweepAt = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req: any, res: any, next: any) => {
    const ip = req.ip;
    const now = Date.now();
    if (hits.size > 0 && now - lastSweepAt >= windowMs) {
      for (const [k, e] of hits) if (now - e.start >= windowMs) hits.delete(k);
      lastSweepAt = now;
    }
    const entry = hits.get(ip);
    if (!entry || now - entry.start >= windowMs) {
      hits.set(ip, { start: now, count: 1 });
      return next();
    }
    if (entry.count < max) {
      entry.count++;
      return next();
    }
    const retryAfter = Math.ceil((entry.start + windowMs - now) / 1000);
    res.set('X-Retry-After', String(retryAfter));
    return res
      .status(429)
      .json({ message: 'Too many requests. Please try again later.' });
  };
}
const registerTicketRateLimit = makeIpRateLimit(10, 60 * 1000);
const redeemTicketRateLimit = makeIpRateLimit(20, 60 * 1000);

/**
 * @swagger
 * /auth/web-login/register-ticket:
 *   post:
 *     summary: Mint a single-use, short-lived passkey registration ticket
 *     description: >
 *       Authenticated with the caller's Bearer session token. Requires a fresh
 *       session (recent login); returns 403 SESSION_NOT_FRESH otherwise so the
 *       client can re-authenticate. The returned ticket is handed to the browser
 *       registration page so the raw session token never appears in a URL.
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Ticket minted
 *       401:
 *         description: Missing or invalid session
 *       403:
 *         description: Session not fresh; re-authentication required
 */
router.post(
  '/web-login/register-ticket',
  registerTicketRateLimit,
  async (req, res) => {
    try {
      const authz = req.headers.authorization;
      const rawToken =
        typeof authz === 'string' && authz.startsWith('Bearer ')
          ? authz.split(' ')[1]
          : null;
      if (!rawToken) {
        return res.status(401).json({ message: 'Authentication required.' });
      }

      const { auth } = authModule;
      // Convert the Bearer session token into the cookie getSession expects.
      await bridgeBearerAuthHeader(req);
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      if (!session || !session.session || !session.user) {
        return res.status(401).json({ message: 'Invalid or expired session.' });
      }

      // Freshness gate: planting a new login credential requires a recent login
      // (Better Auth default freshAge = 24h).
      const freshAge = auth.options.session?.freshAge ?? 60 * 60 * 24;
      if (freshAge > 0) {
        const lastUpdated = new Date(
          session.session.updatedAt ?? session.session.createdAt
        ).getTime();
        if (Date.now() - lastUpdated >= freshAge * 1000) {
          return res.status(403).json({
            code: 'SESSION_NOT_FRESH',
            message: 'Please re-authenticate to add a passkey.',
          });
        }
      }

      const ticket = await mintRegistrationTicket(session.user.id, rawToken);
      return res.json({ ticket });
    } catch (err) {
      log('error', `[WEB LOGIN] register-ticket error: ${err}`);
      return res
        .status(500)
        .json({ message: 'Failed to create registration ticket.' });
    }
  }
);

/**
 * @swagger
 * /auth/web-login/redeem-ticket:
 *   post:
 *     summary: Redeem a single-use passkey registration ticket
 *     description: >
 *       Public (the ticket is the credential) and rate-limited. Returns the
 *       session token in the JSON body exactly once; the ticket is then consumed.
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Session token returned
 *       400:
 *         description: Invalid, used, or expired ticket
 */
router.post(
  '/web-login/redeem-ticket',
  redeemTicketRateLimit,
  async (req, res) => {
    try {
      const ticket =
        typeof req.body?.ticket === 'string' ? req.body.ticket : '';
      if (!ticket || ticket.length > 512) {
        return res.status(400).json({
          code: 'INVALID_TICKET',
          message: 'Invalid registration ticket.',
        });
      }
      const result = await redeemRegistrationTicket(ticket);
      if (!result) {
        return res.status(400).json({
          code: 'INVALID_TICKET',
          message:
            'This registration link has expired. Please try again from the app.',
        });
      }
      return res.json({ token: result.sessionToken });
    } catch (err) {
      log('error', `[WEB LOGIN] redeem-ticket error: ${err}`);
      return res
        .status(500)
        .json({ message: 'Failed to redeem registration ticket.' });
    }
  }
);

router.get('/web-login/callback', async (req, res) => {
  const { auth } = authModule;

  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session || !session.session) {
      log('error', '[WEB LOGIN] Callback: No active session found.');
      return res.status(400).send('No active session found.');
    }

    const token = session.session.token;
    const email = session.user.email;
    const role = (session.user as any).role || '';

    // Redirect to the mobile app scheme with session details in the URL
    // FRAGMENT (after #), not the query string. Fragments are never sent to a
    // server, so the raw session token can't leak into access / proxy logs.
    res.redirect(
      `sparkyfitnessmobile://oauth-callback#token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}&role=${encodeURIComponent(role)}`
    );
  } catch (err) {
    log('error', `[WEB LOGIN] Callback error: ${err}`);
    res.status(500).send('Failed to prepare session token callback.');
  }
});

export default router;
