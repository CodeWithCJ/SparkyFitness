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

// Same private/local ranges the server classifies in utils/corsHelper.ts.
const PRIVATE_IP_RANGES = ['loopback', 'private', 'linkLocal', 'uniqueLocal'];

/**
 * True when the URL points at a loopback/RFC-1918/link-local/unique-local IP
 * (classified with ipaddr.js, matching the server's `isPrivateNetworkAddress`)
 * or a local-only TLD (.local/.lan/.internal/.home.arpa). These are LAN /
 * self-hosting targets where plain HTTP is expected during local development.
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

  // IP literals: classify the range with ipaddr.js.
  try {
    const addr = ipaddr.parse(host);
    if (PRIVATE_IP_RANGES.includes(addr.range())) return true;
    // IPv4-mapped IPv6 (e.g. ::ffff:192.168.1.1) → check the embedded IPv4.
    if (addr.kind() === 'ipv6') {
      const v6 = addr as ipaddr.IPv6;
      if (v6.isIPv4MappedAddress() && PRIVATE_IP_RANGES.includes(v6.toIPv4Address().range())) {
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
 * certs). Plain HTTP is accepted only for private/LAN hosts during development;
 * production always requires HTTPS.
 */
export const getInsecureUrlError = (url: string): string | null => {
  const normalized = normalizeUrl(url).toLowerCase();
  if (normalized.startsWith('https://')) return null;

  if (__DEV__ && isPrivateOrLocalHost(url)) return null;

  const healthPolicy = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';
  return `HTTPS is required to securely register passkeys, access your camera, and sync health data in compliance with ${healthPolicy} security policies.`;
};
