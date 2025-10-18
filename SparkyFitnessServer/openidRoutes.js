const express = require("express");
const router = express.Router();
const { Issuer, generators } = require("openid-client");
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
        const issuerConfig = {
            timeout: provider.timeout,
        };

        const discoveredIssuer = await Issuer.discover(provider.issuer_url, issuerConfig);
        log('info', 'OIDC Issuer discovered successfully.');

        const issuer = new Issuer({
            issuer: discoveredIssuer.issuer,
            authorization_endpoint: discoveredIssuer.authorization_endpoint,
            token_endpoint: discoveredIssuer.token_endpoint,
            jwks_uri: discoveredIssuer.jwks_uri,
            userinfo_endpoint: discoveredIssuer.userinfo_endpoint,
        });
        log('info', 'OIDC Issuer configured from discovered metadata:', issuer.issuer);

        if (!issuer.jwks && issuer.jwks_uri) {
            log('debug', `JWKS not found in discovery, fetching from jwks_uri: ${issuer.jwks_uri}`);
            const jwksResponse = await fetch(issuer.jwks_uri);
            if (!jwksResponse.ok) {
                throw new Error(`Failed to fetch JWKS from ${issuer.jwks_uri}: ${jwksResponse.statusText}`);
            }
            issuer.jwks = await jwksResponse.json();
            log('debug', 'Successfully fetched JWKS.');
        }

        const client = new issuer.Client({
            client_id: provider.client_id,
            client_secret: provider.client_secret,
            redirect_uris: provider.redirect_uris,
            response_types: provider.response_types,
            token_endpoint_auth_method: provider.token_endpoint_auth_method,
            id_token_signed_response_alg: provider.signing_algorithm,
            userinfo_signed_response_alg: provider.profile_signing_algorithm,
        });

        const clientWrapper = { client, provider };
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

// This middleware is no longer needed as we initialize clients on demand.
// router.use(async (req, res, next) => { ... });

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

    const { client, provider } = clientWrapper;
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const state = generators.state();
    const nonce = generators.nonce();

    req.session.codeVerifier = codeVerifier;
    req.session.state = state;
    req.session.nonce = nonce;
    req.session.providerId = providerId; // Store providerId for the callback
    log('debug', `[OIDC Login] Storing in session: providerId=${providerId}, state=${state}, nonce=${nonce}`);

    const redirectUri = (provider.redirect_uris && provider.redirect_uris[0]) || `${process.env.SPARKY_FITNESS_FRONTEND_URL}/oidc-callback`;

    const authorizationUrl = client.authorizationUrl({
        scope: provider.scope,
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        state,
        nonce,
    });

    req.session.save((err) => {
        if (err) {
            log('error', 'Failed to save session before sending OIDC auth URL:', err);
            return next(err);
        }
        log('info', `Sending OIDC authorization URL to frontend for provider ${providerId}: ${authorizationUrl}`);
        res.json({ authorizationUrl });
    });
});

// Handle the callback from the frontend
router.post("/callback", async (req, res, next) => {
    const { providerId } = req.session;
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
        const { client, provider } = clientWrapper;
        const { code, state } = req.body;
    log('debug', `[OIDC Callback] Received request with code: ${code ? 'present' : 'missing'}`);
    log('debug', `[OIDC Callback] Session ID: ${req.session.id}`);
    log('debug', `[OIDC Callback] Session content before callback: ${JSON.stringify(req.session, null, 2)}`);
    log('debug', `[OIDC Callback] Expected state from session: ${req.session.state}`);
    log('debug', `[OIDC Callback] Received state in body: ${state}`);

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is missing.' });
    }

    // Retrieve the redirect_uri that would have been used.
    // IMPORTANT: This must match one of the URIs registered with the OIDC provider.
    // This now points to the FRONTEND callback handler.
    const redirectUri = (provider.redirect_uris && provider.redirect_uris[0]) || `${process.env.SPARKY_FITNESS_FRONTEND_URL}/oidc-callback`;

    const params = { code, state };

    log('debug', `[OIDC Callback] Session state before callback: ${req.session.state}`);
    const tokenSet = await client.callback(
      redirectUri,
      params,
      {
        code_verifier: req.session.codeVerifier,
        state: req.session.state,
        nonce: req.session.nonce,
        response_type: 'code',
        check: {
          issuer: provider.issuer_url,
          id_token_signed_response_alg: provider.signing_algorithm
        }
      }
    );

    log('info', "Successfully received and validated tokens from OIDC provider.");
    
    // As requested, keeping detailed logs for troubleshooting.
    if (tokenSet.id_token) {
      try {
        const payload = JSON.parse(Buffer.from(tokenSet.id_token.split('.')[1], 'base64url').toString('utf8'));
        log('info', 'OIDC DEBUG: Decoded ID Token Payload:', payload);
      } catch (err) {
        log('error', 'OIDC DEBUG: Failed to decode or parse ID token payload.', err);
      }
    }
    
    log('debug', "Validated ID Token claims:", tokenSet.claims());
    
    let claims = tokenSet.claims();
    let userinfoClaims = {};

    // Explicitly fetch user info from the userinfo_endpoint
    if (client.userinfo) {
      try {
        userinfoClaims = await client.userinfo(tokenSet.access_token);
        log('info', 'OIDC DEBUG: Fetched Userinfo Claims:', userinfoClaims);
        // Merge userinfo claims with id_token claims, prioritizing userinfo claims
        claims = { ...claims, ...userinfoClaims };
        log('info', 'OIDC DEBUG: Merged Claims (ID Token + Userinfo):', claims);
      } catch (userinfoError) {
        log('error', 'OIDC DEBUG: Failed to fetch userinfo from endpoint:', userinfoError.message);
        // Continue with claims from id_token if userinfo fetch fails
      }
    } else {
      log('debug', 'OIDC DEBUG: userinfo_endpoint not available or client not configured for it.');
    }

    const userEmail = (claims.email || claims.preferred_username)?.toLowerCase();
    const oidcSub = claims.sub;

    // Auto-registration logic
    // Auto-registration logic
    if (provider.auto_register && userEmail && oidcSub) {
        log('info', `OIDC callback for provider ${providerId}: Auto-registration enabled for ${userEmail}.`);
        try {
            let user = await userRepository.findUserByEmail(userEmail);

            if (!user) {
                log('info', `OIDC callback: User ${userEmail} not found. Attempting auto-registration.`);
                const newUserId = await authService.registerOidcUser(userEmail, claims.name || userEmail, providerId, oidcSub);
                user = await userRepository.findUserById(newUserId);
                log('info', `OIDC callback: Auto-registered and linked new user with ID: ${newUserId}.`);
            } else {
                // User exists, check if they are already linked to this provider
                const existingLink = await userRepository.findUserOidcLink(user.id, providerId);
                if (!existingLink) {
                    log('info', `OIDC callback: User ${userEmail} found. Linking to provider ${providerId}.`);
                    await userRepository.createUserOidcLink(user.id, providerId, oidcSub);
                } else if (existingLink.oidc_sub !== oidcSub) {
                    log('info', `OIDC callback: OIDC sub has changed for user ${userEmail}. Updating link.`);
                    await userRepository.updateUserOidcLink(existingLink.id, oidcSub);
                }
                else {
                    log('info', `OIDC callback: User ${userEmail} is already linked to provider ${providerId}.`);
                }
            }

            if (user && user.id) {
                req.session.user = { ...claims, userId: user.id, role: user.role || 'user' };
            } else {
                log('error', `OIDC callback: Failed to create or find a valid user for ${userEmail}.`);
                req.session.user = { ...claims, role: 'user' }; // Fallback
            }
        } catch (regError) {
            log('error', `OIDC callback: Error during auto-registration for ${userEmail}:`, regError);
            req.session.user = claims; // Fallback
        }
    } else {
        log('info', `OIDC callback: Auto-registration not enabled. Checking for existing user.`);
        const user = await userRepository.findUserByOidcSub(oidcSub, providerId) || await userRepository.findUserByEmail(userEmail);
        if (user) {
            log('info', `OIDC callback: Found existing user with ID: ${user.id}.`);
            // Ensure the OIDC link exists, even if auto-registration is off.
            const existingLink = await userRepository.findUserOidcLink(user.id, providerId);
            if (!existingLink) {
                log('info', `OIDC callback: User ${userEmail} found. Linking to provider ${providerId}.`);
                await userRepository.createUserOidcLink(user.id, providerId, oidcSub);
            } else if (existingLink.oidc_sub !== oidcSub) {
                log('info', `OIDC callback: OIDC sub has changed for user ${userEmail}. Updating link.`);
                await userRepository.updateUserOidcLink(existingLink.id, oidcSub);
            }
            req.session.user = { ...claims, userId: user.id, role: user.role || 'user' };
        } else {
            log('warn', `OIDC callback: No existing user found for ${userEmail} and auto-registration is disabled.`);
            req.session.user = claims; // Fallback for no user found
        }
    }

    req.session.tokens = tokenSet; // refresh_token if any
    log('info', 'OIDC authentication successful. Saving session and redirecting to /openid/api/me');
    req.session.save((err) => {
      if (err) {
        log('error', 'Failed to save session after OIDC callback:', err);
        return next(err);
      }
      res.json({ success: true, redirectUrl: "/" });
    });
  } catch (e) {
    log('error', 'OIDC callback error:', e.message);
    next(e);
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
    // Fetch the user's role from the database to ensure it's up-to-date
    const user = await userRepository.findUserById(req.session.user.userId);
    log('debug', '/openid/api/me: User found in DB:', user);
    if (user) {
      // Combine session data with the role from the database
      const userData = {
        ...req.session.user,
        role: user.role // Ensure the role is included
      };
      log('debug', '/openid/api/me: Returning user data:', userData);
      return res.json(userData);
    } else {
      log('warn', '/openid/api/me: User not found in database for ID:', req.session.user.userId);
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
