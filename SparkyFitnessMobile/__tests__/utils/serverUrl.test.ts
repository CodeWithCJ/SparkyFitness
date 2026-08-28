import { Platform } from 'react-native';
import { normalizeUrl, isPrivateOrLocalHost, getInsecureUrlError } from '../../src/utils/serverUrl';

/** Temporarily overrides Platform.OS for the duration of a test. */
const withPlatform = (os: 'ios' | 'android', fn: () => void) => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  try {
    fn();
  } finally {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  }
};

describe('normalizeUrl', () => {
  test('trims whitespace and trailing slashes', () => {
    expect(normalizeUrl('  https://example.com/  ')).toBe('https://example.com');
    expect(normalizeUrl('https://example.com///')).toBe('https://example.com');
  });

  test('leaves a clean URL unchanged', () => {
    expect(normalizeUrl('https://example.com:3010')).toBe('https://example.com:3010');
  });

  test('does not strip non-trailing slashes', () => {
    expect(normalizeUrl('https://example.com/api/')).toBe('https://example.com/api');
  });
});

describe('isPrivateOrLocalHost', () => {
  describe('local-only hostnames', () => {
    test.each([
      'http://localhost:3010',
      'http://sub.localhost',
      'http://myserver.local',
      'http://web.lan:8080',
      'http://api.internal',
      'http://nas.home.arpa',
    ])('%s is private/local', (url) => {
      expect(isPrivateOrLocalHost(url)).toBe(true);
    });

    test('matches TLD suffixes case-insensitively', () => {
      expect(isPrivateOrLocalHost('http://Web.LAN')).toBe(true);
      expect(isPrivateOrLocalHost('http://LOCALHOST')).toBe(true);
    });

    test('does not match TLD substrings mid-hostname', () => {
      expect(isPrivateOrLocalHost('http://lan.example.com')).toBe(false);
      expect(isPrivateOrLocalHost('http://localhost.example.com')).toBe(false);
    });
  });

  describe('private IPv4 ranges', () => {
    test.each([
      'http://127.0.0.1:3010',
      'http://10.0.0.5',
      'http://172.16.0.1',
      'http://172.31.255.254',
      'http://192.168.1.100:3010',
      'http://169.254.10.10',
    ])('%s is private/local', (url) => {
      expect(isPrivateOrLocalHost(url)).toBe(true);
    });

    test.each([
      'http://8.8.8.8',
      'http://172.32.0.1',
      'http://11.0.0.1',
      'http://193.168.1.1',
      'http://100.63.255.255',
      'http://100.128.0.0',
    ])('%s is public', (url) => {
      expect(isPrivateOrLocalHost(url)).toBe(false);
    });

    describe('carrier-grade NAT (100.64.0.0/10, Tailscale/ZeroTier)', () => {
      test.each(['http://100.64.0.1', 'http://100.127.255.254'])(
        '%s is private on Android',
        (url) => {
          withPlatform('android', () => {
            expect(isPrivateOrLocalHost(url)).toBe(true);
          });
        },
      );

      test.each(['http://100.64.0.1', 'http://100.127.255.254'])(
        '%s is NOT private on iOS (unverified ATS behavior, requires HTTPS)',
        (url) => {
          withPlatform('ios', () => {
            expect(isPrivateOrLocalHost(url)).toBe(false);
          });
        },
      );
    });
  });

  describe('IPv6', () => {
    test('loopback and unique-local literals in brackets', () => {
      expect(isPrivateOrLocalHost('http://[::1]:3000')).toBe(true);
      expect(isPrivateOrLocalHost('http://[fd12:3456:789a::1]')).toBe(true);
      expect(isPrivateOrLocalHost('http://[fe80::1]')).toBe(true);
    });

    test('IPv4-mapped IPv6 checks the embedded IPv4 range', () => {
      expect(isPrivateOrLocalHost('http://[::ffff:192.168.1.1]')).toBe(true);
      expect(isPrivateOrLocalHost('http://[::ffff:8.8.8.8]')).toBe(false);
    });

    test('public IPv6 literal is not private', () => {
      expect(isPrivateOrLocalHost('http://[2606:4700::1111]')).toBe(false);
    });
  });

  describe('host extraction', () => {
    test('ignores scheme, port, path, query, fragment, and userinfo', () => {
      expect(isPrivateOrLocalHost('https://user:pass@192.168.0.2:8443/path?q=1#frag')).toBe(true);
      expect(isPrivateOrLocalHost('user:pass@example.com/path')).toBe(false);
    });

    test('handles a bare host with no scheme', () => {
      expect(isPrivateOrLocalHost('192.168.1.1')).toBe(true);
      expect(isPrivateOrLocalHost('example.com')).toBe(false);
    });

    test('strips a trailing dot from the hostname', () => {
      expect(isPrivateOrLocalHost('http://myserver.local.')).toBe(true);
    });

    test('empty string is not private', () => {
      expect(isPrivateOrLocalHost('')).toBe(false);
    });
  });

  test('public domains are not private', () => {
    expect(isPrivateOrLocalHost('https://sparky.example.com')).toBe(false);
    expect(isPrivateOrLocalHost('http://example.com')).toBe(false);
  });
});

describe('getInsecureUrlError', () => {
  test('https always passes, including IP hosts and messy formatting', () => {
    expect(getInsecureUrlError('https://sparky.example.com')).toBeNull();
    expect(getInsecureUrlError('https://192.168.1.10:3010')).toBeNull();
    expect(getInsecureUrlError('  HTTPS://Example.com/  ')).toBeNull();
  });

  test('plain http to a private/LAN/VPN host passes, in dev and production alike', () => {
    expect(getInsecureUrlError('http://192.168.1.10:3010')).toBeNull();
    expect(getInsecureUrlError('http://localhost:3010')).toBeNull();
    expect(getInsecureUrlError('http://web.lan')).toBeNull();
  });

  test('carrier-grade NAT (Tailscale/ZeroTier) HTTP passes on Android but is rejected on iOS', () => {
    withPlatform('android', () => {
      expect(getInsecureUrlError('http://100.64.10.5:3010')).toBeNull();
    });
    withPlatform('ios', () => {
      expect(getInsecureUrlError('http://100.64.10.5:3010')).toBeTruthy();
    });
  });

  test('plain http to a public host is always rejected', () => {
    expect(getInsecureUrlError('http://sparky.example.com')).toBeTruthy();
    expect(getInsecureUrlError('http://8.8.8.8')).toBeTruthy();
  });
});
