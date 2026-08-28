import ipaddr from 'ipaddr.js';
import { Platform } from 'react-native';

/** Trims whitespace and any trailing slashes from a server URL. */
export const normalizeUrl = (url: string): string => url.trim().replace(/\/+$/, '');

/**
 * Extracts the lowercased hostname from a URL string without relying on RN's
 * partial `URL` implementation (whose `.hostname` is unreliable on Hermes).
 */
const extractHost = (url: string): string => {
  const withoutScheme = url.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const authority = withoutScheme.split('/')[0].split('?')[0].split('#')[0];
  const hostPort = authority.split('@').pop() ?? '';
  // IPv6 literal, e.g. [::1]:3000 → ::1
  const ipv6 = hostPort.match(/^\[([^\]]+)\]/);
  if (ipv6) return ipv6[1].toLowerCase();
  return hostPort.split(':')[0].toLowerCase().replace(/\.$/, '');
};

// Same private/local ranges the server classifies in utils/corsHelper.ts, plus
// `carrierGradeNat` (100.64.0.0/10) — the range Tailscale assigns its
// tailnet IPs from, which ipaddr.js does not bucket under `private`.
const PRIVATE_IP_RANGES = ['loopback', 'private', 'linkLocal', 'uniqueLocal', 'carrierGradeNat'];

// iOS-only: ranges that are private/local but that iOS's ATS
// `NSAllowsLocalNetworking` exception cannot be relied on to cover. Apple's
// own guidance is inconsistent about whether it exempts every IP literal or
// only RFC1918/link-local (see the discussion in app.config.ts), and as of
// iOS 17 ATS additionally blocks bare IP-literal connections by default
// unless an `NSExceptionDomains` entry exists. Rather than gamble on
// undocumented OS behavior for a security-relevant decision, treat
// carrier-grade NAT (Tailscale/ZeroTier's 100.64.0.0/10) as still requiring
// HTTPS on iOS specifically, until real-device testing confirms otherwise.
// Android has no such ambiguity: its cleartext permission isn't scoped by IP
// range at all once the base-config allows it.
const IOS_UNVERIFIED_PRIVATE_RANGES = ['carrierGradeNat'];

/**
 * True when the URL points at a loopback/RFC-1918/link-local/unique-local/
 * carrier-grade-NAT IP (classified with ipaddr.js, matching the server's
 * `isPrivateNetworkAddress`) or a local-only TLD (.local/.lan/.internal/
 * .home.arpa). These are LAN / self-hosting / mesh-VPN (Tailscale, ZeroTier)
 * targets where plain HTTP is an accepted trade-off.
 *
 * Known limitation: the hostname-suffix branch (`.local`/`.lan`/`.internal`/
 * `.home.arpa`) is a string match, not a DNS resolution + IP check, so it
 * can't detect DNS rebinding (a suffix hostname whose record is later
 * changed, or was always pointed, at a public IP). React Native has no
 * reliable synchronous DNS-resolution API to close this without adding a
 * native module. This is judged an acceptable residual risk because, unlike
 * a CORS Origin header, the hostname here is not attacker-supplied per
 * request — it's the user's own server address, typed once into Settings —
 * so exploiting it requires talking a user into entering a specific
 * malicious hostname as their trusted server, not just getting them to visit
 * a web page or open a link.
 *
 * On iOS, carrier-grade-NAT addresses (Tailscale/ZeroTier's 100.64.0.0/10)
 * are excluded from this allowance — see {@link IOS_UNVERIFIED_PRIVATE_RANGES}
 * — because it's unverified whether iOS's ATS actually permits plain HTTP to
 * that range. Android has no such carve-out.
 */
export const isPrivateOrLocalHost = (url: string): boolean => {
  const host = extractHost(url);
  if (!host) return false;

  // Local-only hostnames / mDNS TLDs — ipaddr.js only classifies IP literals.
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (
    host.endsWith('.local') ||
    host.endsWith('.lan') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa')
  ) {
    return true;
  }

  const isAllowedRange = (range: string): boolean =>
    PRIVATE_IP_RANGES.includes(range) &&
    !(Platform.OS === 'ios' && IOS_UNVERIFIED_PRIVATE_RANGES.includes(range));

  // IP literals: classify the range with ipaddr.js.
  try {
    const addr = ipaddr.parse(host);
    if (isAllowedRange(addr.range())) return true;
    // IPv4-mapped IPv6 (e.g. ::ffff:192.168.1.1) → check the embedded IPv4.
    if (addr.kind() === 'ipv6') {
      const v6 = addr as ipaddr.IPv6;
      if (v6.isIPv4MappedAddress() && isAllowedRange(v6.toIPv4Address().range())) {
        return true;
      }
    }
  } catch {
    // Not an IP literal (public domain, etc.) → not private.
  }
  return false;
};

/**
 * Returns a user-facing error when the server URL must use HTTPS but doesn't,
 * otherwise null. HTTPS always passes (including IP hosts with self-signed
 * certs). Plain HTTP is accepted for private/LAN/VPN hosts (RFC 1918,
 * link-local, unique-local, and local-only TLDs) so self-hosters reachable
 * only over a home network aren't forced onto HTTPS. On Android, carrier-
 * grade NAT (Tailscale's 100.64.0.0/10) is included in that allowance too;
 * on iOS it is not (see {@link IOS_UNVERIFIED_PRIVATE_RANGES}), so a
 * Tailscale/ZeroTier user on iOS still needs HTTPS until that platform's ATS
 * behavior is device-verified. Plain HTTP to any other host (public
 * domains/IPs) is always rejected, in both development and production
 * builds.
 */
export const getInsecureUrlError = (url: string, localizedMessage?: string): string | null => {
  const normalized = normalizeUrl(url).toLowerCase();
  if (normalized.startsWith('https://')) return null;

  if (isPrivateOrLocalHost(url)) return null;

  const healthPolicy = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';
  return localizedMessage ?? `HTTPS is required to securely register passkeys, access your camera, and sync health data in compliance with ${healthPolicy} security policies. Plain HTTP is only allowed for private network addresses (e.g. LAN IPs, Tailscale, ZeroTier).`;
};

/**
 * Boolean form of {@link getInsecureUrlError} for call sites (API/auth
 * clients) that just need a transport guard before sending a request, not a
 * user-facing message.
 */
export const isInsecureUrlBlocked = (url: string): boolean => getInsecureUrlError(url) !== null;

/**
 * Stricter guard for browser-based passkey (WebAuthn) sign-in specifically.
 * Unlike {@link isInsecureUrlBlocked}, this does NOT allow the private/LAN/
 * VPN-range carve-out: the server's passkey page requires a browser secure
 * context (`window.isSecureContext`), which plain HTTP never satisfies even
 * on a private IP, so opening the passkey browser flow over HTTP would just
 * fail silently after the fact. Requiring HTTPS up front here gives the user
 * an accurate error immediately instead.
 */
export const isPasskeyUrlBlocked = (url: string): boolean =>
  !normalizeUrl(url).toLowerCase().startsWith('https://');
