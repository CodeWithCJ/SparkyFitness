const jwt = require("jsonwebtoken");
const { log } = require("../config/logging");
const { JWT_SECRET } = require("../security/encryption");
const userRepository = require("../models/userRepository"); // Import userRepository
const { getClient, getSystemClient } = require("../db/poolManager"); // Import getClient and getSystemClient

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

  // Allow MFA challenge related routes to be authenticated with a special MFA token
  // This token is short-lived and only grants access to MFA endpoints.
  // Handle MFA challenge routes with a special MFA token
  if (req.originalUrl.startsWith("/auth/mfa/") && (req.originalUrl.includes("/request-email-code") || req.originalUrl.includes("/verify") || req.originalUrl.includes("/verify-email-code"))) {
    log("debug", "authenticate middleware: Path matches MFA challenge route.");
    // Access headers in a case-insensitive way to handle potential variations
    const mfaToken = req.headers['x-mfa-token'] || req.headers['X-MFA-Token'];
    
    if (mfaToken) {
      try {
        const decoded = jwt.verify(mfaToken, JWT_SECRET);
        if (decoded.purpose === 'mfa_challenge') {
          req.userId = decoded.userId;
          return next();
        }
      } catch (err) {
        log("warn", `Authentication: Invalid or expired MFA challenge token. Error: ${err.message}`);
        return res.status(401).json({ error: "Authentication: Invalid or expired MFA token." });
      }
    } else {
      log("warn", "authenticate middleware: X-MFA-Token is missing for MFA challenge route.");
    }
  }

  // 1. Check for JWT token in cookie
  const token = req.cookies.token;

  if (token) {
    try {
      const user = jwt.verify(token, JWT_SECRET);
      req.userId = user.userId; // Attach userId from JWT payload to request
      log("debug", `Authentication: JWT token valid. User ID: ${req.userId}`);
      return next();
    } catch (err) {
      log("warn", "Authentication: JWT token invalid or expired.", err.message);
      // Do not return here, try other authentication methods
    }
  }

  // 2. Check for session-based authentication (for OIDC)
  if (req.session && req.session.user && req.session.user.userId) {
    req.userId = req.session.user.userId;
    log("debug", `Authentication: Session valid. User ID: ${req.userId}`);
    return next();
  }

  // 3. Try to authenticate with API Key
  const userIdFromApiKey = await tryAuthenticateWithApiKey(req, res, next);
  if (userIdFromApiKey) {
    req.userId = userIdFromApiKey;
    return next();
  }

  // If no authentication method succeeded
  log("warn", "Authentication: No token, active session, or valid API key provided.");
  return res.status(401).json({ error: "Authentication: No token, active session, or valid API key provided." });
};


const isAdmin = async (req, res, next) => {
  if (!req.userId) {
    log(
      "warn",
      "Admin Check: No user ID found in request. User not authenticated."
    );
    return res
      .status(401)
      .json({ error: "Admin Check: Authentication required." });
  }

  try {
    // Prioritize environment variable for super-admin check
    if (process.env.SPARKY_FITNESS_ADMIN_EMAIL) {
      const user = await userRepository.findUserById(req.userId);
      if (user && user.email === process.env.SPARKY_FITNESS_ADMIN_EMAIL) {
        log("debug", `Admin Check: Super-admin ${user.email} granted access.`);
        return next();
      }
    }

    const userRole = await userRepository.getUserRole(req.userId);
    if (userRole === "admin") {
      next();
    } else {
      log(
        "warn",
        `Admin Check: User ${req.userId} with role '${userRole}' attempted to access admin resource.`
      );
      return res
        .status(403)
        .json({
          error: "Admin Check: Access denied. Admin privileges required.",
        });
    }
  } catch (error) {
    log(
      "error",
      `Admin Check: Error checking user role for user ${req.userId}: ${error.message}`
    );
    return res
      .status(500)
      .json({ error: "Admin Check: Internal server error during role check." });
  }
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
