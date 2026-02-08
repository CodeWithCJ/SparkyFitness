const { isPrivateNetworkAddress, createCorsOriginChecker } = require('../utils/corsHelper');

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
      expect(isPrivateNetworkAddress('0.0.0.0')).toBe(true);
    });

    it('should recognize IPv6 loopback', () => {
      expect(isPrivateNetworkAddress('::1')).toBe(true);
      expect(isPrivateNetworkAddress('[::1]')).toBe(true);
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
  });

  describe('createCorsOriginChecker', () => {
    it('should allow configured frontend URL', (done) => {
      const checker = createCorsOriginChecker('http://localhost:8080', false);
      checker('http://localhost:8080', (err, allowed) => {
        expect(err).toBeNull();
        expect(allowed).toBe(true);
        done();
      });
    });

    it('should allow requests with no origin', (done) => {
      const checker = createCorsOriginChecker('http://localhost:8080', false);
      checker(undefined, (err, allowed) => {
        expect(err).toBeNull();
        expect(allowed).toBe(true);
        done();
      });
    });

    it('should reject private network origins when allowPrivateNetworks=false', (done) => {
      const checker = createCorsOriginChecker('http://example.com', false);
      checker('http://192.168.1.100:3000', (err, allowed) => {
        expect(err).toBeNull();
        expect(allowed).toBe(false);
        done();
      });
    });

    it('should allow private network origins when allowPrivateNetworks=true', (done) => {
      const checker = createCorsOriginChecker('http://example.com', true);
      checker('http://192.168.1.100:3000', (err, allowed) => {
        expect(err).toBeNull();
        expect(allowed).toBe(true);
        done();
      });
    });

    it('should allow localhost from private networks when enabled', (done) => {
      const checker = createCorsOriginChecker('http://example.com', true);
      checker('http://localhost:3000', (err, allowed) => {
        expect(err).toBeNull();
        expect(allowed).toBe(true);
        done();
      });
    });

    it('should reject localhost when private networks are disabled', (done) => {
      const checker = createCorsOriginChecker('http://example.com', false);
      checker('http://localhost:3000', (err, allowed) => {
        expect(err).toBeNull();
        expect(allowed).toBe(false);
        done();
      });
    });

    it('should reject public IPs regardless of setting', (done) => {
      const checker = createCorsOriginChecker('http://example.com', true);
      checker('http://8.8.8.8:3000', (err, allowed) => {
        expect(err).toBeNull();
        expect(allowed).toBe(false);
        done();
      });
    });

    it('should reject unregistered origins', (done) => {
      const checker = createCorsOriginChecker('http://localhost:8080', false);
      checker('http://unwanted.com', (err, allowed) => {
        expect(err).toBeNull();
        expect(allowed).toBe(false);
        done();
      });
    });
  });
});
