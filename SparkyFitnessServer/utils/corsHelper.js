const ipaddr = require("ipaddr.js");

/**
 * Check if a host is a private network address
 * @param {string} hostname - The hostname to check (e.g., "192.168.1.100", "localhost", "10.0.0.5")
 * @returns {boolean} True if the host is a private network address
 */
function isPrivateNetworkAddress(hostname) {
  if (!hostname) return false;

  let cleanHostname = hostname.toLowerCase();

  // Try to clean up port if present using URL parser
  // We prepend http:// to ensure it parses as a URL from a hostname string
  try {
    // Check if it already has a protocol, if not add one
    const urlStr = cleanHostname.match(/^[a-z]+:\/\//)
      ? cleanHostname
      : `http://${cleanHostname}`;
    const url = new URL(urlStr);
    cleanHostname = url.hostname;

    // Remove brackets for IPv6 [::1] -> ::1 as ipaddr.js expects raw address
    if (cleanHostname.startsWith("[") && cleanHostname.endsWith("]")) {
      cleanHostname = cleanHostname.slice(1, -1);
    }
  } catch (err) {
    // If URL parsing fails, proceed with original string
  }

  // Check localhost explicitly as it's not an IP address
  if (cleanHostname === "localhost") {
    return true;
  }

  try {
    // Parse the hostname as an IP address
    const addr = ipaddr.parse(cleanHostname);
    const range = addr.range();

    // Check for various private/local ranges
    const privateRanges = ["loopback", "private", "linkLocal", "uniqueLocal"];
    if (privateRanges.includes(range)) {
      return true;
    }

    // Special handling for IPv4-mapped IPv6 addresses (e.g., ::ffff:192.168.1.1)
    if (addr.kind() === "ipv6" && addr.isIPv4MappedAddress()) {
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
 * @param {string} extraTrustedOrigins - Comma-separated list of extra trusted origins
 * @returns {Function} A function suitable for the `origin` option in cors middleware
 */
function createCorsOriginChecker(
  configuredFrontendUrl,
  allowPrivateNetworks = false,
  extraTrustedOrigins = "",
) {
  const allowedOrigins = [];

  // Add configured frontend URL with validation
  if (configuredFrontendUrl) {
    try {
      // Validate URL format
      new URL(configuredFrontendUrl);
      allowedOrigins.push(configuredFrontendUrl.replace(/\/$/, ""));
    } catch (err) {
      console.warn(`Invalid configured frontend URL: ${configuredFrontendUrl}`);
    }
  }

  // Add extra trusted origins
  if (extraTrustedOrigins) {
    extraTrustedOrigins.split(",").forEach((originStr) => {
      const origin = originStr.trim();
      if (!origin) return;
      try {
        new URL(origin);
        allowedOrigins.push(origin.replace(/\/$/, ""));
      } catch (err) {
        console.warn(`Invalid extra trusted origin: ${origin}`);
      }
    });
  }

  return (origin, callback) => {
    // Reject requests with no origin for security
    // Non-browser clients (mobile apps, API clients) should use JWT/API key authentication
    if (!origin) {
      //console.info('CORS: Rejected request with no Origin header');
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
      console.warn(
        `Invalid origin attempted: ${origin}, error: ${err.message}`,
      );
      return callback(null, false);
    }

    // Reject if not allowed - log for security monitoring and debugging
    const rejectionReason = allowPrivateNetworks
      ? "origin not in allowlist and not a private network"
      : "origin not in allowlist (private networks disabled)";
    console.info(`CORS: Rejected origin ${origin} - ${rejectionReason}`);
    return callback(null, false);
  };
}

module.exports = {
  isPrivateNetworkAddress,
  createCorsOriginChecker,
};
