/**
 * CORS helper utilities for allowing private network and configured frontend URLs
 */

/**
 * Check if a host is a private network address
 * @param {string} host - The host to check (e.g., "192.168.1.100", "localhost", "10.0.0.5:3000")
 * @returns {boolean} True if the host is a private network address
 */
function isPrivateNetworkAddress(host) {
  if (!host) return false;

  // Remove port if present - handle both IPv4 and IPv6
  let hostname = host.toLowerCase();

  // Check for bracketed IPv6 format first [ipv6]:port
  if (hostname.startsWith('[')) {
    // Extract IPv6 from brackets: [2001:db8::1]:8080 -> [2001:db8::1]
    const closingBracket = hostname.indexOf(']');
    if (closingBracket === -1) {
      // Malformed: opening bracket without closing bracket
      return false;
    }
    hostname = hostname.substring(0, closingBracket + 1);
  } else {
    // Cache split result to avoid redundant operation
    const parts = hostname.split(':');
    if (parts.length > 2) {
      // Multiple colons = IPv6 (not IPv4:port)
      // Keep as-is since it's already without brackets/port
      // e.g., 2001:db8:85a3::8a2e:370:7334
    } else if (parts.length === 2) {
      // Single colon = IPv4:port or plain hostname
      // Split to remove port: 192.168.1.1:3000 -> 192.168.1.1
      hostname = parts[0];
    }
    // else: no colon, keep hostname as-is
  }

  // IPv4 private ranges (limit to 1-3 digits per octet for validation)
  const ipv4Patterns = [
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 127.0.0.0/8 (loopback)
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/, // 172.16.0.0/12
    /^192\.168\.\d{1,3}\.\d{1,3}$/, // 192.168.0.0/16
    /^169\.254\.\d{1,3}\.\d{1,3}$/, // 169.254.0.0/16 (link-local)
  ];

  // IPv6 private addresses (limit quantifiers to prevent ReDoS)
  const ipv6Patterns = [
    /^::1$/i, // ::1 (loopback)
    /^\[::1\]$/i, // [::1] (loopback in URL form)
    /^fc[0-9a-f:]{1,100}$/i, // fc00::/7 (unique local, max 100 chars)
    /^\[fc[0-9a-f:]{1,100}\]$/i, // [fc00::/7] (unique local, bracketed)
    /^fe[0-9a-f:]{1,100}$/i, // fe00::/9 and fe80::/10 (link-local)
    /^\[fe[0-9a-f:]{1,100}\]$/i, // [fe00::/9 and fe80::/10] (link-local, bracketed)
  ];

  // Check localhost (0.0.0.0 removed - ambiguous in CORS context)
  if (hostname === 'localhost') {
    return true;
  }

  // Check IPv4
  if (ipv4Patterns.some((pattern) => pattern.test(hostname))) {
    return true;
  }

  // Check IPv6
  if (ipv6Patterns.some((pattern) => pattern.test(hostname))) {
    return true;
  }

  return false;
}

/**
 * Create a CORS origin checker function that allows configured frontend URL and optionally private networks
 * @param {string} configuredFrontendUrl - The frontend URL from environment (e.g., "http://localhost:8080")
 * @param {boolean} allowPrivateNetworks - Whether to allow private network addresses (default: false for security)
 * @returns {Function} A function suitable for the `origin` option in cors middleware
 */
function createCorsOriginChecker(configuredFrontendUrl, allowPrivateNetworks = false) {
  const allowedOrigins = [];

  // Add configured frontend URL with validation
  if (configuredFrontendUrl) {
    try {
      // Validate URL format
      new URL(configuredFrontendUrl);
      allowedOrigins.push(configuredFrontendUrl);
    } catch (err) {
      console.warn(`Invalid configured frontend URL: ${configuredFrontendUrl}`);
    }
  }

  return (origin, callback) => {
    // Reject requests with no origin for security
    // Non-browser clients (mobile apps, API clients) should use JWT/API key authentication
    if (!origin) {
      console.info('CORS: Rejected request with no Origin header');
      return callback(null, false);
    }

    // Check if origin matches configured frontend URL
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Extract hostname from origin (e.g., "http://192.168.1.100:3000" -> "192.168.1.100")
    try {
      const originUrl = new URL(origin);
      const originHostname = originUrl.hostname;

      // Check if origin is from a private network (only if explicitly enabled)
      if (allowPrivateNetworks && isPrivateNetworkAddress(originHostname)) {
        return callback(null, true);
      }
    } catch (err) {
      // If URL parsing fails, log and reject silently
      console.warn(`Invalid origin attempted: ${origin}, error: ${err.message}`);
      return callback(null, false);
    }

    // Reject if not allowed - log for security monitoring and debugging
    const rejectionReason = allowPrivateNetworks 
      ? 'origin not in allowlist and not a private network'
      : 'origin not in allowlist (private networks disabled)';
    console.info(`CORS: Rejected origin ${origin} - ${rejectionReason}`);
    return callback(null, false);
  };
}

module.exports = {
  isPrivateNetworkAddress,
  createCorsOriginChecker,
};
