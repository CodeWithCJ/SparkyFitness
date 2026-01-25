const express = require("express");
const router = express.Router();
const fs = require('fs');
const path = require('path');
const debugLogPath = path.join(__dirname, 'oidc_debug.log');

function debugLog(message) {
  try {
    fs.appendFileSync(debugLogPath, `${new Date().toISOString()} - ${message}\n`);
  } catch (e) {
    // ignore
  }
}
const client = require("openid-client");
const oidcProviderRepository = require('./models/oidcProviderRepository');
const userRepository = require('./models/userRepository');
const authService = require('./services/authService');
const { log } = require('./config/logging');

const oidcClientCache = new Map();

async function getOidcClient(providerId) {
  if (oidcClientCache.has(providerId)) {
    return oidcClientCache.get(providerId);
  }

  log('info', `OIDC client for provider ${providerId} not in cache. Initializing...`);
  const provider = await oidcProviderRepository.getOidcProviderById(providerId);

  if (!provider || !provider.is_active) {
    log('warn', `OIDC provider ${providerId} not found or is inactive.`);
    return null;
  }

  try {
    const server = new URL(provider.issuer_url);
    const clientId = provider.client_id;
    const clientSecret = provider.client_secret;

    log('info', `Attempting OIDC discovery for: ${server.href}`);

    // Determine the authentication method from provider config or default to 'client_secret_post'
    const authMethod = provider.token_endpoint_auth_method || 'client_secret_post';
    let clientAuth;

    try {
      if (authMethod === 'client_secret_basic') {
        clientAuth = client.ClientSecretBasic(clientSecret);
      } else if (authMethod === 'client_secret_post') {
        clientAuth = client.ClientSecretPost(clientSecret);
      } else if (authMethod === 'client_secret_jwt') {
        clientAuth = client.ClientSecretJwt(clientSecret);
      } else if (authMethod === 'none') {
        clientAuth = client.None();
      } else {
        // Default to ClientSecretPost if unknown/unsupported (or handle specific errors)
        log('warn', `Unknown or unimplemented auth method '${authMethod}' for provider ${providerId}. Defaulting to client_secret_post.`);
        clientAuth = client.ClientSecretPost(clientSecret);
      }
    } catch (authError) {
      log('error', `Failed to initialize client authentication for method ${authMethod}:`, authError);
      return null;
    }

    const clientMetadata = {
      client_id: clientId,
      client_secret: clientSecret,
      token_endpoint_auth_method: authMethod,
    };

    if (provider.signing_algorithm) {
      clientMetadata.id_token_signed_response_alg = provider.signing_algorithm;
    }

    // discovery(server, clientId, metadata, clientAuthentication)
    const config = await client.discovery(server, clientId, clientMetadata, clientAuth);
    log('info', `OIDC Issuer discovered successfully using v6 API with auth method: ${authMethod}`);

    const clientWrapper = { config, provider };
    oidcClientCache.set(providerId, clientWrapper);
    log('info', `OIDC client for provider ${providerId} initialized and cached.`);
    return clientWrapper;
  } catch (error) {
    log('error', `Failed to initialize OIDC client for provider ${providerId}:`, error);
    return null;
  }
}

function clearOidcClientCache(providerId) {
  if (providerId) {
    oidcClientCache.delete(providerId);
    log('info', `OIDC client cache cleared for provider ${providerId}.`);
  } else {
    oidcClientCache.clear();
    log('info', 'OIDC client cache fully cleared.');
  }
}

router.use(express.json());

// Get all active providers for the login page
router.get("/providers", async (req, res) => {
  try {
    const providers = await oidcProviderRepository.getOidcProviders();
    const activeProviders = providers.filter(p => p.is_active).map(({ id, display_name, logo_url }) => ({ id, display_name, logo_url }));
    res.json(activeProviders);
  } catch (error) {
    log('error', 'Error fetching OIDC providers for login page:', error);
    res.status(500).json({ message: 'Could not retrieve OIDC providers.' });
  }
});

// Kick off the flow for a specific provider
router.get("/login/:providerId", async (req, res, next) => {
  const { providerId } = req.params;
  log('debug', `Received login request for OIDC provider ${providerId}`);

  const clientWrapper = await getOidcClient(providerId);
  if (!clientWrapper) {
    return res.status(503).json({ error: 'OIDC provider not available or configured correctly.' });
  }

  const { config, provider } = clientWrapper;

  const code_verifier = client.randomPKCECodeVerifier();
  const code_challenge = await client.calculatePKCECodeChallenge(code_verifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  req.session.codeVerifier = code_verifier;
  req.session.state = state;
  req.session.nonce = nonce;
  req.session.providerId = providerId;
  log('debug', `[OIDC Login] Storing in session: providerId=${providerId}, state=${state}, nonce=${nonce}`);

  const redirect_uri = (provider.redirect_uris && provider.redirect_uris[0]) || `${process.env.SPARKY_FITNESS_FRONTEND_URL}/oidc-callback`;

  const parameters = {
    redirect_uri,
    scope: provider.scope || 'openid email profile',
    code_challenge,
    code_challenge_method: "S256",
  };

  // Always send state for CSRF protection and because we validate it on callback
  parameters.state = state;
  // nonce is usually required for OIDC
  parameters.nonce = nonce;

  const redirectTo = client.buildAuthorizationUrl(config, parameters);

  req.session.save((err) => {
    if (err) {
      log('error', 'Failed to save session before sending OIDC auth URL:', err);
      return next(err);
    }
    log('info', `Sending OIDC authorization URL to frontend for provider ${providerId}: ${redirectTo.href}`);
    res.json({ authorizationUrl: redirectTo.href });
  });
});

// Handle the callback from the frontend
router.post("/callback", async (req, res, next) => {
  const { providerId, codeVerifier, state: expectedState, nonce: expectedNonce } = req.session;

  if (!providerId) {
    log('error', '[OIDC Callback] providerId not found in session.');
    return res.status(400).json({ error: 'Session expired or invalid.' });
  }

  log('debug', `Received OIDC callback for provider ${providerId}`);
  const clientWrapper = await getOidcClient(providerId);
  if (!clientWrapper) {
    return res.status(503).json({ error: 'OIDC provider not available or configured correctly.' });
  }

  try {
    const { config, provider } = clientWrapper;
    const { code, state, search } = req.body;

    if (!code && !search) {
      return res.status(400).json({ error: 'Authorization code or transition data is missing.' });
    }

    const redirect_uri = (provider.redirect_uris && provider.redirect_uris[0]) || `${process.env.SPARKY_FITNESS_FRONTEND_URL}/oidc-callback`;

    // In v6, authorizationCodeGrant takes the full current URL or we can reconstruct it.
    // We prefer using the full search string from the frontend to ensure all parameters (like 'iss') are preserved.
    const callbackUrl = new URL(redirect_uri);
    if (search) {
      // search is expected to be window.location.search (e.g. "?code=...&state=...&iss=...")
      const searchParams = new URLSearchParams(search);
      searchParams.forEach((value, key) => {
        callbackUrl.searchParams.set(key, value);
      });
    } else {
      // Fallback for older frontend version or simple cases
      callbackUrl.searchParams.set('code', code);
      if (state) callbackUrl.searchParams.set('state', state);
    }

    log('info', "Exchanging code for tokens using v6 API...");
    log('debug', `OIDC Callback URL: ${callbackUrl.href}`);
    log('debug', `OIDC Expected State: ${expectedState}, Expected Nonce: ${expectedNonce}`);

    let tokens;
    try {
      tokens = await client.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: codeVerifier,
        expectedState: expectedState,
        expectedNonce: expectedNonce,
        idTokenExpected: true,
      });
    } catch (grantError) {
      const errorMsg = `authorizationCodeGrant failed for provider ${providerId}: ${grantError.message}`;
      log('error', errorMsg, grantError);
      debugLog(errorMsg);
      if (grantError.response) {
        try {
          const body = await grantError.response.text();
          debugLog(`OIDC Error Response Body: ${body}`);
          log('error', `OIDC Error Response Body: ${body}`);
          log('error', `OIDC Error Response Headers:`, JSON.stringify(Object.fromEntries(grantError.response.headers.entries())));
        } catch (readError) {
          log('error', 'Could not read OIDC error response body:', readError);
        }
      }
      throw grantError;
    }

    log('info', "Successfully received and validated tokens from OIDC provider.");

    // Store id_token in session for optimized logout (id_token_hint)
    req.session.idToken = tokens.id_token;

    const claims = tokens.claims();
    log('debug', "Validated ID Token claims:", claims);

    let finalClaims = { ...claims };

    // Fetch user info if possible
    if (config.serverMetadata().userinfo_endpoint) {
      try {
        const userInfoResponse = await client.fetchUserInfo(config, tokens.access_token, claims.sub);
        log('info', 'OIDC DEBUG: Fetched Userinfo Claims:', userInfoResponse);
        finalClaims = { ...finalClaims, ...userInfoResponse };
      } catch (userinfoError) {
        log('error', 'OIDC DEBUG: Failed to fetch userinfo from endpoint:', userinfoError.message);
      }
    }

    const oidcSub = finalClaims.sub;
    const userEmail = (finalClaims.email || finalClaims.preferred_username)?.toLowerCase();

    try {
      // 1. Always try to find user by stable OIDC sub first
      let user = await userRepository.findUserByOidcSub(oidcSub, providerId);

      if (!user && userEmail) {
        // 2. Try to find user by email as a secondary lookup
        user = await userRepository.findUserByEmail(userEmail);
        if (user) {
          log('info', `OIDC callback for provider ${providerId}: Found existing user by email ${userEmail}. Linking to provider.`);
        }
      }

      if (!user && provider.auto_register) {
        // 3. Auto-register if enabled and user not found
        log('info', `OIDC callback for provider ${providerId}: Attempting auto-registration for sub ${oidcSub}.`);
        const registerEmail = userEmail || `${oidcSub}@${providerId}.oidc.internal`;
        const fullName = finalClaims.name || finalClaims.full_name || finalClaims.given_name || registerEmail;
        const newUserId = await authService.registerOidcUser(registerEmail, fullName, providerId, oidcSub);
        user = await userRepository.findUserById(newUserId);
      }

      if (user) {
        // 4. Ensure OIDC link is in sync (created or updated if sub changed)
        const existingLink = await userRepository.findUserOidcLink(user.id, providerId);
        if (!existingLink) {
          log('info', `OIDC callback: Creating new link for user ${user.id} and provider ${providerId}.`);
          await userRepository.createUserOidcLink(user.id, providerId, oidcSub);
        } else if (existingLink.oidc_sub !== oidcSub) {
          log('info', `OIDC callback: OIDC sub has changed for user ${user.id}. Updating link.`);
          await userRepository.updateUserOidcLink(existingLink.id, oidcSub);
        }

        // 5. Establish session
        req.session.user = {
          ...finalClaims,
          userId: user.id,
          role: user.role || 'user',
          fullName: user.full_name,
          activeUserId: user.id
        };
        req.session.providerId = providerId; // Important for logout id_token_hint
      } else {
        log('warn', `OIDC callback: No user found or created for sub ${oidcSub}. Proceeding with limited session.`);
        req.session.user = { ...finalClaims, role: 'user' };
      }
    } catch (dbError) {
      log('error', `OIDC callback: Error during user lookup/registration for sub ${oidcSub}:`, dbError);
      req.session.user = finalClaims;
    }

    res.json({ success: true, redirectUrl: '/' });
  } catch (error) {
    log('error', 'OIDC Callback Error:', error);
    res.status(500).json({ error: error.message || 'OIDC callback failed' });
  }
});

// Protect an API route
router.get("/api/me", async (req, res) => {
  log('debug', '/openid/api/me hit. Session user:', req.session.user);
  if (!req.session.user || !req.session.user.userId) {
    log('warn', '/openid/api/me: No active session or user ID found. Returning 401.');
    return res.status(401).json({ error: "Unauthorized", message: "No active session or user ID found." });
  }
  try {
    const activeUserId = req.session.user.activeUserId || req.session.user.userId;
    const user = await userRepository.findUserById(activeUserId);
    log('debug', '/openid/api/me: User found in DB:', user);
    if (user) {
      const userData = {
        ...req.session.user,
        activeUserId: activeUserId,
        role: user.role,
        fullName: user.full_name,
        // Ensure we don't accidentally override the authenticated identity's ID with the active profile ID if downstream expects 'userId' to remain the login identity
        // But for display purposes, we want the active profile.
        // Let's assume the frontend uses 'activeUserId' for logic but 'fullName' for display.
        // However, if the session user ID is User A, and we switch to User B, we might want to return User B's info but keep userId as User A?
        // Let's look at how useAuth.tsx uses it.
      };

      // Re-reading useAuth.tsx:
      // setUser({
      //   id: userData.userId,
      //   activeUserId: userData.activeUserId || userData.userId,
      //   email: userData.email,
      //   fullName: userData.fullName || userData.full_name || null,
      //   role: role
      // });

      // If we return the active user's fullName, it will be displayed.
      // So fetching the activeUser seems correct.

      log('debug', '/openid/api/me: Returning user data:', userData);
      return res.json(userData);
    } else {
      log('warn', '/openid/api/me: User not found in database for ID:', activeUserId);
      return res.status(404).json({ error: "Not Found", message: "User not found in database." });
    }
  } catch (error) {
    log('error', 'Error fetching user data for /openid/api/me:', error);
    return res.status(500).json({ error: "Internal Server Error", message: "Failed to retrieve user data." });
  }
});

module.exports = {
  router,
  getOidcClient,
  clearOidcClientCache,
};
