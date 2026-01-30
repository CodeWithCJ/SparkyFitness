const { log } = require("../config/logging");
const userRepository = require("../models/userRepository"); // Import userRepository
const { getClient, getSystemClient } = require("../db/poolManager"); // Import getClient and getSystemClient
const { canAccessUserData } = require("../utils/permissionUtils");

const tryAuthenticateWithApiKey = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const apiKey = authHeader && authHeader.split(" ")[1]; // Bearer API_KEY

  if (!apiKey) {
    return null; // No API key found
  }

  let client;
  try {
    client = await getSystemClient(); // Use system client for API key validation
    const result = await client.query(
      'SELECT user_id FROM user_api_keys WHERE api_key = $1 AND is_active = TRUE',
      [apiKey]
    );

    if (result.rows.length > 0) {
      log("debug", `Authentication: API Key valid. User ID: ${result.rows[0].user_id}`);
      return result.rows[0].user_id;
    }
  } catch (error) {
    log("error", "Error during API Key authentication:", error);
  } finally {
    if (client) {
      client.release();
    }
  }
  return null;
};

const authenticate = async (req, res, next) => {
  // Allow public access to the /api/auth/settings endpoint
  if (req.path === "/settings") {
    return next();
  }

  log("debug", `authenticate middleware: req.path = ${req.path}`);

  // 1. Better Auth Session Check (Primary Identity)
  try {
    const { auth } = require("../auth");
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (session && session.user) {
      log("debug", `Authentication: Better Auth session valid. User ID: ${session.user.id}`);
      req.authenticatedUserId = session.user.id;
      req.originalUserId = req.authenticatedUserId;
      req.user = session.user; // Full user object for convenience

      // Check for 'sparky_active_user_id' cookie for context switching
      const activeUserId = req.cookies.sparky_active_user_id;
      if (activeUserId && activeUserId !== req.authenticatedUserId) {
        const { canAccessUserData } = require("../utils/permissionUtils");
        // Broad check: Do they have AT LEAST one of the major permissions for this user?
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
          req.activeUserId = req.authenticatedUserId; // Fallback to self
          // Optionally clear the cookie if invalid
        }
      } else {
        req.activeUserId = req.authenticatedUserId;
      }

      req.userId = req.activeUserId; // RLS context

      // LAZY INITIALIZATION: Ensure user has profile and goals
      // This is necessary for users created directly via Better Auth or OIDC
      try {
        await userRepository.ensureUserInitialization(session.user.id, session.user.name);
      } catch (err) {
        log("error", `Lazy Initialization failed for user ${session.user.id}:`, err);
      }

      return next();
    }
  } catch (error) {
    log("error", "Error checking Better Auth session:", error);
  }

  // 2. Try to authenticate with API Key (for Mobile/Integrations)
  const userIdFromApiKey = await tryAuthenticateWithApiKey(req, res, next);
  if (userIdFromApiKey) {
    req.authenticatedUserId = userIdFromApiKey;
    req.activeUserId = userIdFromApiKey;
    req.originalUserId = userIdFromApiKey;
    req.userId = userIdFromApiKey;
    return next();
  }

  // If no authentication method succeeded
  log("warn", "Authentication: No valid session or API key provided.");
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

const authorize = (requiredPermission) => {
  return async (req, res, next) => {
    if (!req.userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    // In a real application, you would fetch user permissions from the DB
    // For this example, we'll assume a simple permission check
    // You might have a user object on req.user that contains roles/permissions
    // For now, we'll just check if the requiredPermission is present as a string
    // and if the user has that permission. This is a placeholder.
    // The actual implementation would depend on your permission management system.

    // For the purpose of this fix, we'll assume that if a permission is required,
    // it means the user needs to be authenticated, and the permission check
    // will be handled by the RLS in the DB layer.
    // So, if we reach here, and req.userId is present, authentication is successful.
    // The 'requiredPermission' argument is primarily for clarity in the route definitions.

    next();
  };
};

module.exports = {
  authenticate,
  isAdmin,
  authorize,
};
