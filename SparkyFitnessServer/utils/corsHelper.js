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
  
  // Detect IPv6 (contains ::) and handle appropriately
  if (hostname.includes('::')) {
    // IPv6 address - either [::1]:3000 or ::1
    if (hostname.startsWith('[')) {
      // Bracketed form: extract what's inside brackets
      hostname = hostname.split(']')[0] + ']';
    }
    // else: plain IPv6 like ::1, keep as-is
  } else {
    // IPv4 or hostname - remove port by splitting on first colon
    hostname = hostname.split(':')[0];
  }

  // IPv4 private ranges
  const ipv4Patterns = [
    /^127\.\d+\.\d+\.\d+$/, // 127.0.0.0/8 (loopback)
    /^10\.\d+\.\d+\.\d+$/, // 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/, // 172.16.0.0/12
    /^192\.168\.\d+\.\d+$/, // 192.168.0.0/16
    /^169\.254\.\d+\.\d+$/, // 169.254.0.0/16 (link-local)
  ];

  // IPv6 private addresses
  const ipv6Patterns = [
    /^::1$/i, // ::1 (loopback)
    /^\[::1\]$/i, // [::1] (loopback in URL form)
    /^fc[0-9a-f:]+$/i, // fc00::/7 (unique local)
    /^fe[0-9a-f:]+$/i, // fe00::/9 and fe80::/10 (link-local and multicast)
  ];

  // Check localhost
  if (hostname === 'localhost' || hostname === '0.0.0.0') {
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

  // Add configured frontend URL
  if (configuredFrontendUrl) {
    allowedOrigins.push(configuredFrontendUrl);
  }

  return (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) {
      return callback(null, true);
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

    // Reject if not allowed (silent rejection - CORS will return 403 without the header)
    return callback(null, false);
  };
}

module.exports = {
  isPrivateNetworkAddress,
  createCorsOriginChecker,
};
