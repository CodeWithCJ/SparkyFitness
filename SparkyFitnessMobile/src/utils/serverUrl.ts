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
  // IPv6 literal, e.g. [::1]:3000
  const ipv6 = hostPort.match(/^\[([^\]]+)\]/);
  if (ipv6) return ipv6[1].toLowerCase();
  return hostPort.split(':')[0].toLowerCase().replace(/\.$/, '');
};

/**
 * True when the URL points at a loopback address, an RFC-1918 private range, a
 * link-local address, or a local-only TLD (.local/.lan/.internal/.home.arpa).
 * These are LAN / self-hosting targets where plain HTTP is expected during
 * local development.
 */
export const isPrivateOrLocalHost = (url: string): boolean => {
  const host = extractHost(url);
  if (!host) return false;

  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (
    host.endsWith('.local') ||
    host.endsWith('.lan') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa')
  ) {
    return true;
  }
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd')) return true; // IPv6 loopback + ULA

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
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
