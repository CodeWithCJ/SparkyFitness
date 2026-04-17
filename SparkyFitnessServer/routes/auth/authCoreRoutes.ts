import express from 'express';
import { log } from '../../config/logging.js';
import globalSettingsRepository from '../../models/globalSettingsRepository.js';
import oidcProviderRepository from '../../models/oidcProviderRepository.js';
import userRepository from '../../models/userRepository.js';
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
  if (!email) {
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
export default router;
