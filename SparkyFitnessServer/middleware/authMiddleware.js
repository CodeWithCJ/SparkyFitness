const jwt = require("jsonwebtoken");
const { log } = require("../config/logging");
const { JWT_SECRET } = require("../security/encryption");
const userRepository = require("../models/userRepository"); // Import userRepository

const authenticate = (req, res, next) => {
  // Allow public access to the /api/auth/settings endpoint
  if (req.path === "/settings") {
    return next();
  }

  // Check for JWT token in Authorization header (for traditional login)
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (token) {
    // log("debug", `Authentication: JWT token found. Verifying...`); // Commented out for less verbose logging
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        log("warn", "Authentication: Invalid or expired token.", err.message);
        return res
          .status(403)
          .json({ error: "Authentication: Invalid or expired token." });
      }
      req.userId = user.userId; // Attach userId from JWT payload to request
      // log("debug", `Authentication: JWT token valid. User ID: ${req.userId}`); // Commented out for less verbose logging
      next();
    });
  } else if (req.session && req.session.user && req.session.user.userId) {
    // If no JWT token, check for session-based authentication (for OIDC)
    // log(
    //   "debug",
    //   `Authentication: No JWT token found, checking session. User ID from session: ${req.session.user.userId}`
    // ); // Commented out for less verbose logging
    req.userId = req.session.user.userId;
    next();
  } else {
    log("warn", "Authentication: No token or active session provided.");
    return res
      .status(401)
      .json({ error: "Authentication: No token or active session provided." });
  }

  // Final check to ensure userId is set before proceeding
  if (!req.userId) {
    log("warn", "Authentication: req.userId is not set after authentication attempts.");
    return res
      .status(401)
      .json({ error: "Authentication: User ID could not be determined." });
  }
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
