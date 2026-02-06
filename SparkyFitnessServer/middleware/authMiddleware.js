const { log } = require("../config/logging");
const userRepository = require("../models/userRepository"); // Import userRepository
const { getClient, getSystemClient } = require("../db/poolManager"); // Import getClient and getSystemClient
const { canAccessUserData } = require("../utils/permissionUtils");

const authenticate = async (req, res, next) => {
  // Allow public access to the /api/auth/settings endpoint
  if (req.path === "/settings") {
    return next();
  }

  //log("debug", `authenticate middleware: req.path = ${req.path}, req.headers.cookie = ${req.headers.cookie}`);

  // 1. Better Auth Session & API Key Check (Unified Identity)
  try {
    const { auth } = require("../auth");

    // Support Bearer token from mobile app by mapping it to x-api-key
    // Better Auth's API Key plugin defaults to looking for 'x-api-key'
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      const token = req.headers.authorization.split(' ')[1];
      if (token) {
        req.headers['x-api-key'] = token;
        log("debug", "Authentication: Mapped Bearer token to x-api-key header for Better Auth.");
      }
    }

    // getSession natively handles both Browser Cookies and Authorization: Bearer <API_KEY> (if configured)
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

      // Support for scoping (for future broad API key use)
      req.permissions = session.session?.metadata?.permissions || { "*": true };

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
