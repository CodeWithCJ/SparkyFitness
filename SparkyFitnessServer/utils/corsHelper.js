const ipaddr = require('ipaddr.js');

/**
 * Check if a host is a private network address
 * @param {string} hostname - The hostname to check (e.g., "192.168.1.100", "localhost", "10.0.0.5")
 * @returns {boolean} True if the host is a private network address
 */
function isPrivateNetworkAddress(hostname) {
  if (!hostname) return false;

  const lowerHostname = hostname.toLowerCase();

  // Check localhost explicitly as it's not an IP address
  if (lowerHostname === 'localhost') {
    return true;
  }

  try {
    // Parse the hostname as an IP address
    const addr = ipaddr.parse(lowerHostname);
    const range = addr.range();

    // Check for various private/local ranges
    const privateRanges = ['loopback', 'private', 'linkLocal', 'uniqueLocal'];
    if (privateRanges.includes(range)) {
      return true;
    }

    // Special handling for IPv4-mapped IPv6 addresses (e.g., ::ffff:192.168.1.1)
    if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) {
      const ipv4Addr = addr.toIPv4Address();
      if (privateRanges.includes(ipv4Addr.range())) {
        return true;
      }
    }
  } catch (err) {
    // If not a valid IP address, ipaddr.parse throws an error.
    // In this context, that means it's a non-IP hostname (like a public domain),
    // so we return false as it's not a private network address.
    return false;
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
