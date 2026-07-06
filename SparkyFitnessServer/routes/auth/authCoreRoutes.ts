import express from 'express';
import { log } from '../../config/logging.js';
import globalSettingsRepository from '../../models/globalSettingsRepository.js';
import oidcProviderRepository from '../../models/oidcProviderRepository.js';
import userRepository from '../../models/userRepository.js';
import authModule from '../../auth.js';
import { serializeSignedCookie } from 'better-call';
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

router.get('/web-login/passkey', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Passkey Login</title>
  <script src="https://unpkg.com/@simplewebauthn/browser@10.0.0/dist/bundle/index.umd.min.js"></script>
  <style>
    body {
      background-color: #0b0f19;
      color: #f3f4f6;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background-color: #1f2937;
      border: 1px solid #374151;
      padding: 30px;
      border-radius: 12px;
      max-width: 400px;
      width: 100%;
      text-align: center;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 10px;
      color: #3b82f6;
    }
    p {
      color: #9ca3af;
      font-size: 0.875rem;
      margin-bottom: 25px;
    }
    .btn {
      background-color: #3b82f6;
      color: white;
      border: none;
      padding: 12px 24px;
      font-size: 1rem;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      width: 100%;
      transition: background-color 0.2s;
    }
    .btn:hover {
      background-color: #2563eb;
    }
    .btn:disabled {
      background-color: #4b5563;
      cursor: not-allowed;
    }
    .error {
      color: #ef4444;
      margin-top: 15px;
      font-size: 0.875rem;
    }
    .spinner {
      border: 3px solid #374151;
      border-top: 3px solid #3b82f6;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      animation: spin 1s linear infinite;
      margin: 0 auto 15px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="card">
    <div id="loading-spinner" class="spinner"></div>
    <h1 id="title">Authenticating...</h1>
    <p id="desc">Please complete the biometric passkey prompt.</p>
    <button id="retry-btn" class="btn" style="display: none;">Retry Passkey Login</button>
    <div id="error-msg" class="error"></div>
  </div>

  <script>
    const { startAuthentication } = SimpleWebAuthnBrowser;

    async function doAuth() {
      const errorDiv = document.getElementById('error-msg');
      const retryBtn = document.getElementById('retry-btn');
      const spinner = document.getElementById('loading-spinner');
      const title = document.getElementById('title');
      const desc = document.getElementById('desc');

      errorDiv.innerText = '';
      retryBtn.style.display = 'none';
      spinner.style.display = 'block';
      title.innerText = 'Authenticating...';
      desc.innerText = 'Please complete the biometric passkey prompt.';

      try {
        // 1. Fetch authentication options from the server
        const optionsRes = await fetch('/api/auth/passkey/generate-authenticate-options');
        if (!optionsRes.ok) {
          throw new Error('Failed to generate passkey authentication options.');
        }
        const options = await optionsRes.json();

        // 2. Trigger the browser's native passkey prompt
        const assertion = await startAuthentication(options);

        // 3. Post verification assertion to the server
        const verifyRes = await fetch('/api/auth/passkey/verify-authentication', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ response: assertion }),
        });

        if (!verifyRes.ok) {
          const errData = await verifyRes.json().catch(() => ({}));
          throw new Error(errData.message || 'Passkey verification failed on server.');
        }

        // Success! Redirect to the cookie callback to return session to the app
        title.innerText = 'Success!';
        desc.innerText = 'Redirecting back to the app...';
        window.location.href = '/api/auth/web-login/callback';
      } catch (err) {
        console.error(err);
        spinner.style.display = 'none';
        title.innerText = 'Login Failed';
        desc.innerText = 'Could not authenticate with your passkey.';
        errorDiv.innerText = err.message || String(err);
        retryBtn.style.display = 'block';
      }
    }

    document.getElementById('retry-btn').onclick = doAuth;
    
    // Auto-trigger on load
    window.onload = doAuth;
  </script>
</body>
</html>
  `);
});

router.get('/web-login/register-passkey', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Add Passkey</title>
  <script src="https://unpkg.com/@simplewebauthn/browser@10.0.0/dist/bundle/index.umd.min.js"></script>
  <style>
    body {
      background-color: #0b0f19;
      color: #f3f4f6;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background-color: #1f2937;
      border: 1px solid #374151;
      padding: 30px;
      border-radius: 12px;
      max-width: 400px;
      width: 100%;
      text-align: center;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 10px;
      color: #3b82f6;
    }
    p {
      color: #9ca3af;
      font-size: 0.875rem;
      margin-bottom: 25px;
    }
    .btn {
      background-color: #3b82f6;
      color: white;
      border: none;
      padding: 12px 24px;
      font-size: 1rem;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      width: 100%;
      transition: background-color 0.2s;
    }
    .btn:hover {
      background-color: #2563eb;
    }
    .btn:disabled {
      background-color: #4b5563;
      cursor: not-allowed;
    }
    .error {
      color: #ef4444;
      margin-top: 15px;
      font-size: 0.875rem;
    }
    .spinner {
      border: 3px solid #374151;
      border-top: 3px solid #3b82f6;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      animation: spin 1s linear infinite;
      margin: 0 auto 15px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="card">
    <div id="loading-spinner" class="spinner"></div>
    <h1 id="title">Creating Passkey...</h1>
    <p id="desc">Please complete the biometric registration prompt.</p>
    <button id="retry-btn" class="btn" style="display: none;">Retry Registration</button>
    <div id="error-msg" class="error"></div>
  </div>

  <script>
    const { startRegistration } = SimpleWebAuthnBrowser;

    // Get query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const sessionToken = urlParams.get('token');
    const passkeyName = urlParams.get('name') || 'Mobile Device';

    async function doRegister() {
      const errorDiv = document.getElementById('error-msg');
      const retryBtn = document.getElementById('retry-btn');
      const spinner = document.getElementById('loading-spinner');
      const title = document.getElementById('title');
      const desc = document.getElementById('desc');

      errorDiv.innerText = '';
      retryBtn.style.display = 'none';
      spinner.style.display = 'block';
      title.innerText = 'Creating Passkey...';
      desc.innerText = 'Please complete the biometric registration prompt.';

      if (!sessionToken) {
        spinner.style.display = 'none';
        title.innerText = 'Setup Failed';
        errorDiv.innerText = 'No session token was provided to register the passkey.';
        return;
      }

      try {
        // 1. Fetch registration options from server
        const optionsRes = await fetch('/api/auth/passkey/generate-register-options?name=' + encodeURIComponent(passkeyName), {
          headers: { 'Authorization': 'Bearer ' + sessionToken }
        });
        if (!optionsRes.ok) {
          const errData = await optionsRes.json().catch(() => ({}));
          throw new Error(errData.message || 'Failed to generate registration options.');
        }
        const options = await optionsRes.json();

        // 2. Trigger browser's native passkey registration
        const credential = await startRegistration(options);

        // 3. Post verification credential back to server
        const verifyRes = await fetch('/api/auth/passkey/verify-registration', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + sessionToken 
          },
          body: JSON.stringify({
            response: credential,
            name: passkeyName,
          }),
        });

        if (!verifyRes.ok) {
          const errData = await verifyRes.json().catch(() => ({}));
          throw new Error(errData.message || 'Passkey registration verification failed.');
        }

        // Success! Redirect back to the mobile app callback with success status
        title.innerText = 'Success!';
        desc.innerText = 'Your passkey was registered. Redirecting back...';
        window.location.href = 'sparkyfitnessmobile://oauth-callback?status=success';
      } catch (err) {
        console.error(err);
        spinner.style.display = 'none';
        title.innerText = 'Registration Failed';
        desc.innerText = 'Could not register your passkey.';
        errorDiv.innerText = err.message || String(err);
        retryBtn.style.display = 'block';
      }
    }

    document.getElementById('retry-btn').onclick = doRegister;
    
    // Auto-trigger on load
    window.onload = doRegister;
  </script>
</body>
</html>
  `);
});

router.get('/web-login/callback', async (req, res) => {
  const { auth } = authModule;

  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session || !session.session) {
      log('error', '[WEB LOGIN] Callback: No active session found.');
      return res.status(400).send('No active session found.');
    }

    const token = session.session.token;
    const email = session.user.email;
    const role = (session.user as any).role || '';

    // Redirect to the mobile app schema with session details in query parameters
    res.redirect(
      `sparkyfitnessmobile://oauth-callback?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}&role=${encodeURIComponent(role)}`
    );
  } catch (err) {
    log('error', `[WEB LOGIN] Callback error: ${err}`);
    res.status(500).send('Failed to prepare session token callback.');
  }
});

export default router;
