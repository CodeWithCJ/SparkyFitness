const { log } = require("../config/logging");
const userRepository = require("../models/userRepository"); // Import userRepository
const { getClient, getSystemClient } = require("../db/poolManager"); // Import getClient and getSystemClient
const { canAccessUserData } = require("../utils/permissionUtils");
const { serializeSignedCookie } = require("better-call");

const authenticate = async (req, res, next) => {
  // Allow public access to the /api/auth/settings endpoint
  if (req.path === "/settings") {
    return next();
  }

  //log("debug", `authenticate middleware: req.path = ${req.path}, req.headers.cookie = ${req.headers.cookie}`);

  // 1. Better Auth Session & API Key Check (Unified Identity)
  try {
    const { auth } = require("../auth");

    // Route Bearer tokens to the correct auth mechanism:
    // - API keys (64+ alphanumeric chars, no dots) → x-api-key header
    // - Session tokens (shorter, or contain dots) → signed session cookie
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      const token = req.headers.authorization.split(' ')[1];
      if (token && token.length >= 64 && !token.includes('.')) {
        req.headers['x-api-key'] = token;
        delete req.headers.authorization;
        log("debug", "Authentication: Mapped Bearer token to x-api-key (API key detected).");
      } else if (token) {
        // Session token: sign it and inject as a session cookie so getSession() resolves it.
        // We do this here instead of relying on the bearer plugin due to a compatibility
        // issue with Buffer secrets in @better-auth/utils/hmac.
        const prefix = auth.options.advanced?.cookiePrefix || "better-auth";
        const secureCookiePrefix = auth.options.advanced?.useSecureCookies ? "__Secure-" : "";
        const cookieName = `${secureCookiePrefix}${prefix}.session_token`;
        const signed = await serializeSignedCookie("", token, auth.options.secret);
        const signedValue = signed.replace("=", ""); // Strip leading = from empty cookie name
        const cookieHeader = `${cookieName}=${signedValue}`;
        req.headers.cookie = req.headers.cookie
          ? `${req.headers.cookie}; ${cookieHeader}`
          : cookieHeader;
        delete req.headers.authorization;
        log("debug", "Authentication: Converted Bearer session token to session cookie.");
      }
    }

    // getSession resolves from session cookies or x-api-key header
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (session && session.user) {
      log("debug", `Authentication: Better Auth identity valid. User ID: ${session.user.id}`);
      req.authenticatedUserId = session.user.id;
      req.originalUserId = req.authenticatedUserId;
      req.user = session.user; // Full user object (includes role)

      // Handle 'sparky_active_user_id' cookie for context switching
      const activeUserId = req.cookies.sparky_active_user_id;
      if (activeUserId && activeUserId !== req.authenticatedUserId) {
        const { canAccessUserData } = require("../utils/permissionUtils");
        const [hasReports, hasDiary, hasCheckin] = await Promise.all([
          canAccessUserData(activeUserId, 'reports', req.authenticatedUserId),
          canAccessUserData(activeUserId, 'diary', req.authenticatedUserId),
          canAccessUserData(activeUserId, 'checkin', req.authenticatedUserId)
        ]);

        if (hasReports || hasDiary || hasCheckin) {
          req.activeUserId = activeUserId;
          log("info", `Authentication: Context switched. User ${req.authenticatedUserId} acting as ${req.activeUserId}`);
        } else {
          log("warn", `Authentication: Context access denied for User ${req.authenticatedUserId} -> ${activeUserId}`);
          req.activeUserId = req.authenticatedUserId;
        }
      } else {
        req.activeUserId = req.authenticatedUserId;
      }

      req.userId = req.activeUserId; // RLS context

      // Ensure user initialization
      try {
        await userRepository.ensureUserInitialization(session.user.id, session.user.name);
      } catch (err) {
        log("error", `Lazy Initialization failed for user ${session.user.id}:`, err);
      }

      return next();
    }
  } catch (error) {
    log("error", "Error checking Better Auth identity:", error);

    const code = error?.body?.code;
    if (code === "RATE_LIMITED") {
      const retryAfterMs = error.body?.details?.tryAgainIn;
      if (retryAfterMs) {
        res.set("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
      }
      return res.status(429).json({ error: "Rate limit exceeded." });
    }
    if (code === "KEY_DISABLED") {
      return res.status(403).json({ error: "API key is disabled." });
    }
    if (code === "KEY_EXPIRED") {
      return res.status(401).json({ error: "API key has expired." });
    }
    if (code === "USAGE_EXCEEDED") {
      return res.status(429).json({ error: "API key usage limit exceeded." });
    }
  }

  // No valid authentication found
  log("warn", `Authentication: No valid identity provided for ${req.path}`);
  return res.status(401).json({ error: "Authentication required." });
};


const isAdmin = async (req, res, next) => {
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  // 1. Super-admin override
  if (process.env.SPARKY_FITNESS_ADMIN_EMAIL && req.user?.email === process.env.SPARKY_FITNESS_ADMIN_EMAIL) {
    return next();
  }

  // 2. Native Better Auth Role Check
  // Note: Better Auth stores role in the session/user object if configured
  const userRole = req.user?.role || await userRepository.getUserRole(req.userId);

  if (userRole === "admin") {
    return next();
  }

  log("warn", `Admin Check: Access denied for User ${req.userId} (Role: ${userRole})`);
  return res.status(403).json({ error: "Admin access required." });
};

module.exports = {
  authenticate,
  isAdmin,
};
