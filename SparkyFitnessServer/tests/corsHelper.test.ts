import { describe, expect, it } from 'vitest';
import {
  isPrivateNetworkAddress,
  createCorsOriginChecker,
} from '../utils/corsHelper.js';
describe('corsHelper', () => {
  describe('isPrivateNetworkAddress', () => {
    it('should recognize IPv4 loopback addresses', () => {
      expect(isPrivateNetworkAddress('127.0.0.1')).toBe(true);
      expect(isPrivateNetworkAddress('127.1.1.1')).toBe(true);
    });
    it('should recognize IPv4 private ranges', () => {
      expect(isPrivateNetworkAddress('10.0.0.1')).toBe(true);
      expect(isPrivateNetworkAddress('10.255.255.255')).toBe(true);
      expect(isPrivateNetworkAddress('192.168.1.1')).toBe(true);
      expect(isPrivateNetworkAddress('192.168.255.255')).toBe(true);
      expect(isPrivateNetworkAddress('172.16.0.1')).toBe(true);
      expect(isPrivateNetworkAddress('172.31.255.255')).toBe(true);
    });
    it('should recognize link-local addresses', () => {
      expect(isPrivateNetworkAddress('169.254.1.1')).toBe(true);
    });
    it('should recognize localhost', () => {
      expect(isPrivateNetworkAddress('localhost')).toBe(true);
    });
    it('should recognize IPv6 loopback', () => {
      expect(isPrivateNetworkAddress('::1')).toBe(true);
      expect(isPrivateNetworkAddress('[::1]')).toBe(true);
    });
    it('should recognize expanded IPv6 private addresses', () => {
      // Full IPv6 without :: compression
      expect(
        isPrivateNetworkAddress('fc00:0000:0000:0000:0000:0000:0000:0001')
      ).toBe(true);
      expect(
        isPrivateNetworkAddress('fe80:0000:0000:0000:0000:0000:0000:0001')
      ).toBe(true);
    });
    it('should recognize bracketed IPv6 with ports', () => {
      expect(isPrivateNetworkAddress('[::1]:8080')).toBe(true);
      expect(isPrivateNetworkAddress('[fe80::1]:3000')).toBe(true);
      expect(isPrivateNetworkAddress('[fc00::1]:443')).toBe(true);
    });
    it('should ignore port numbers', () => {
      expect(isPrivateNetworkAddress('192.168.1.1:3000')).toBe(true);
      expect(isPrivateNetworkAddress('localhost:8080')).toBe(true);
    });
    it('should reject public IP addresses', () => {
      expect(isPrivateNetworkAddress('8.8.8.8')).toBe(false);
      expect(isPrivateNetworkAddress('1.1.1.1')).toBe(false);
    });
    it('should handle invalid input', () => {
      expect(isPrivateNetworkAddress(null)).toBe(false);
      expect(isPrivateNetworkAddress(undefined)).toBe(false);
      expect(isPrivateNetworkAddress('')).toBe(false);
    });
    it('should reject malformed bracketed addresses', () => {
      expect(isPrivateNetworkAddress('[::1')).toBe(false); // Missing closing bracket
      expect(isPrivateNetworkAddress('[abc[def]:8080')).toBe(false); // Nested brackets
    });
  });
  describe('createCorsOriginChecker', () => {
    it('should allow configured frontend URL', async () => {
      const checker = createCorsOriginChecker('http://localhost:8080', false);
      await new Promise((resolve) => {
        // @ts-expect-error TS(2554): Expected 3 arguments, but got 2.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        checker('http://localhost:8080', (err: any, allowed: any) => {
          expect(err).toBeNull();
          expect(allowed).toBe(true);
          // @ts-expect-error TS(2794): Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
          resolve();
        });
      });
    });

    it('should reject requests with no origin for security', async () => {
      const checker = createCorsOriginChecker('http://localhost:8080', false);
      await new Promise((resolve) => {
        // @ts-expect-error TS(2554): Expected 3 arguments, but got 2.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        checker(undefined, (err: any, allowed: any) => {
          expect(err).toBeNull();
          expect(allowed).toBe(false);
          // @ts-expect-error TS(2794): Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
          resolve();
        });
      });
    });

    it('should reject private network origins when allowPrivateNetworks=false', async () => {
      const checker = createCorsOriginChecker('http://example.com', false);
      await new Promise((resolve) => {
        // @ts-expect-error TS(2554): Expected 3 arguments, but got 2.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        checker('http://192.168.1.100:3000', (err: any, allowed: any) => {
          expect(err).toBeNull();
          expect(allowed).toBe(false);
          // @ts-expect-error TS(2794): Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
          resolve();
        });
      });
    });

    it('should allow private network origins when allowPrivateNetworks=true', async () => {
      const checker = createCorsOriginChecker('http://example.com', true);
      await new Promise((resolve) => {
        // @ts-expect-error TS(2554): Expected 3 arguments, but got 2.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        checker('http://192.168.1.100:3000', (err: any, allowed: any) => {
          expect(err).toBeNull();
          expect(allowed).toBe(true);
          // @ts-expect-error TS(2794): Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
          resolve();
        });
      });
    });

    it('should allow localhost from private networks when enabled', async () => {
      const checker = createCorsOriginChecker('http://example.com', true);
      await new Promise((resolve) => {
        // @ts-expect-error TS(2554): Expected 3 arguments, but got 2.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        checker('http://localhost:3000', (err: any, allowed: any) => {
          expect(err).toBeNull();
          expect(allowed).toBe(true);
          // @ts-expect-error TS(2794): Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
          resolve();
        });
      });
    });

    it('should reject localhost when private networks are disabled', async () => {
      const checker = createCorsOriginChecker('http://example.com', false);
      await new Promise((resolve) => {
        // @ts-expect-error TS(2554): Expected 3 arguments, but got 2.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        checker('http://localhost:3000', (err: any, allowed: any) => {
          expect(err).toBeNull();
          expect(allowed).toBe(false);
          // @ts-expect-error TS(2794): Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
          resolve();
        });
      });
    });

    it('should reject public IPs regardless of setting', async () => {
      const checker = createCorsOriginChecker('http://example.com', true);
      await new Promise((resolve) => {
        // @ts-expect-error TS(2554): Expected 3 arguments, but got 2.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        checker('http://8.8.8.8:3000', (err: any, allowed: any) => {
          expect(err).toBeNull();
          expect(allowed).toBe(false);
          // @ts-expect-error TS(2794): Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
          resolve();
        });
      });
    });

    it('should reject unregistered origins', async () => {
      const checker = createCorsOriginChecker('http://localhost:8080', false);
      await new Promise((resolve) => {
        // @ts-expect-error TS(2554): Expected 3 arguments, but got 2.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        checker('http://unwanted.com', (err: any, allowed: any) => {
          expect(err).toBeNull();
          expect(allowed).toBe(false);
          // @ts-expect-error TS(2794): Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
          resolve();
        });
      });
    });
  });
});
