const mockDelete = jest.fn();
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ delete: mockDelete })),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

const mockNative = {
  setAllowedHosts: jest.fn(),
  getCertificateInfo: jest.fn(),
  removeCertificate: jest.fn(),
  getHookStatus: jest.fn(),
  importCertificate: jest.fn(),
};
jest.mock('../../modules/client-certificate', () => ({
  __esModule: true,
  default: mockNative,
}));

const mockGetSavedServerUrls = jest.fn();
jest.mock('../../src/services/storage', () => ({
  getSavedServerUrls: () => mockGetSavedServerUrls(),
}));
const mockAddLog = jest.fn();
jest.mock('../../src/services/LogService', () => ({
  addLog: (...args: unknown[]) => mockAddLog(...args),
}));

type Service = typeof import('../../src/services/clientCertificate');

// The service remembers the pending server and the last hosts it sent, so each
// test gets a fresh copy.
const loadService = (): Service => {
  let service!: Service;
  jest.isolateModules(() => {
    service = require('../../src/services/clientCertificate');
  });
  return service;
};

const savedServers = (...urls: string[]) =>
  mockGetSavedServerUrls.mockResolvedValue(urls);

describe('clientCertificate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    savedServers();
    mockNative.getHookStatus.mockReturnValue({ fetch: true, images: true });
    mockNative.getCertificateInfo.mockReturnValue(null);
  });

  describe('hostsForServerUrls', () => {
    it('keeps only the host, once, in lowercase', () => {
      const { hostsForServerUrls } = loadService();

      expect(
        hostsForServerUrls([
          'https://Fit.Example.com:8443/app',
          'https://fit.example.com',
          'https://user:pw@other.example/path?x=1',
          '',
          null,
          undefined,
        ])
      ).toEqual(['fit.example.com', 'other.example']);
    });
  });

  describe('refreshClientCertificateHosts', () => {
    it('sends the hosts of the saved servers', async () => {
      savedServers('https://a.example', 'https://b.example:444');
      const { refreshClientCertificateHosts } = loadService();

      await refreshClientCertificateHosts();

      expect(mockNative.setAllowedHosts).toHaveBeenCalledWith([
        'a.example',
        'b.example',
      ]);
    });

    it('does not call native again when nothing changed', async () => {
      savedServers('https://a.example');
      const { refreshClientCertificateHosts } = loadService();

      await refreshClientCertificateHosts();
      await refreshClientCertificateHosts();

      expect(mockNative.setAllowedHosts).toHaveBeenCalledTimes(1);
    });

    it('sends again after a failed call', async () => {
      savedServers('https://a.example');
      mockNative.setAllowedHosts.mockImplementationOnce(() => {
        throw new Error('native');
      });
      const { refreshClientCertificateHosts } = loadService();

      await refreshClientCertificateHosts();
      await refreshClientCertificateHosts();

      expect(mockNative.setAllowedHosts).toHaveBeenCalledTimes(2);
    });
  });

  describe('a failed read of the saved servers', () => {
    it('keeps the list the native side already has, instead of clearing it', async () => {
      savedServers('https://a.example');
      const { refreshClientCertificateHosts } = loadService();
      await refreshClientCertificateHosts();
      mockNative.setAllowedHosts.mockClear();

      mockGetSavedServerUrls.mockRejectedValueOnce(new Error('storage'));
      await expect(refreshClientCertificateHosts()).resolves.toBeUndefined();

      expect(mockNative.setAllowedHosts).not.toHaveBeenCalled();
    });

    it('recovers on the next refresh', async () => {
      savedServers('https://a.example');
      const { refreshClientCertificateHosts } = loadService();
      mockGetSavedServerUrls.mockRejectedValueOnce(new Error('storage'));

      await refreshClientCertificateHosts();
      await refreshClientCertificateHosts();

      expect(mockNative.setAllowedHosts).toHaveBeenCalledWith(['a.example']);
    });

    it('never rejects, so callers can fire and forget', async () => {
      mockGetSavedServerUrls.mockRejectedValue(new Error('storage'));
      const {
        refreshClientCertificateHosts,
        setPendingClientCertificateServer,
      } = loadService();

      await expect(refreshClientCertificateHosts()).resolves.toBeUndefined();
      await expect(
        setPendingClientCertificateServer('https://a.example')
      ).resolves.toBeUndefined();
    });
  });

  describe('logging', () => {
    it('does not put server host names in the log, and logs only changes', async () => {
      savedServers('https://private-name.example');
      const { refreshClientCertificateHosts } = loadService();

      await refreshClientCertificateHosts();
      await refreshClientCertificateHosts();

      const lines = mockAddLog.mock.calls.map((call) => String(call[0]));
      expect(lines).toHaveLength(1);
      expect(lines.join(' ')).not.toContain('private-name');
    });
  });

  describe('overlapping refreshes', () => {
    it('never sends an older saved list after a newer one', async () => {
      // The first read is slow and predates a save; the second sees the save.
      let releaseFirst!: (urls: string[]) => void;
      mockGetSavedServerUrls
        .mockReturnValueOnce(
          new Promise((resolve) => {
            releaseFirst = resolve;
          })
        )
        .mockResolvedValueOnce([
          'https://a.example',
          'https://just-saved.example',
        ]);
      const { refreshClientCertificateHosts } = loadService();

      const first = refreshClientCertificateHosts();
      const second = refreshClientCertificateHosts();
      releaseFirst(['https://a.example']);
      await Promise.all([first, second]);

      expect(mockNative.setAllowedHosts).toHaveBeenLastCalledWith([
        'a.example',
        'just-saved.example',
      ]);
    });
  });

  describe('setPendingClientCertificateServer', () => {
    it('adds the server being connected to, and drops it when cleared', async () => {
      savedServers('https://a.example');
      const { setPendingClientCertificateServer } = loadService();

      await setPendingClientCertificateServer('https://new.example');
      expect(mockNative.setAllowedHosts).toHaveBeenLastCalledWith([
        'a.example',
        'new.example',
      ]);

      await setPendingClientCertificateServer(null);
      expect(mockNative.setAllowedHosts).toHaveBeenLastCalledWith([
        'a.example',
      ]);
    });

    it('never offers the certificate to a host that is neither saved nor pending', async () => {
      const { setPendingClientCertificateServer } = loadService();

      await setPendingClientCertificateServer('https://first.example');
      await setPendingClientCertificateServer('https://second.example');

      expect(mockNative.setAllowedHosts).toHaveBeenLastCalledWith([
        'second.example',
      ]);
    });
  });

  describe('clientCertificateExpiry', () => {
    const now = Date.UTC(2026, 10, 14);
    const day = 24 * 60 * 60 * 1000;

    it.each([
      [now - day, 'expired'],
      [now + 10 * day, 'expiring'],
      [now + 200 * day, 'valid'],
    ] as const)('%d is %s', (expiresAt, expected) => {
      const { clientCertificateExpiry } = loadService();

      expect(
        clientCertificateExpiry({ subject: 'phone', expiresAt }, now)
      ).toBe(expected);
    });

    it('is unknown when the platform cannot read the date', () => {
      const { clientCertificateExpiry } = loadService();

      expect(
        clientCertificateExpiry({ subject: 'phone', expiresAt: null }, now)
      ).toBeNull();
    });
  });

  describe('importClientCertificate', () => {
    const file = { uri: 'file:///cache/phone.p12', name: 'phone.p12' };

    it('removes the cached copy and refreshes the hosts once stored', async () => {
      savedServers('https://a.example');
      const info = { subject: 'phone', expiresAt: null };
      mockNative.importCertificate.mockResolvedValue({ ok: true, info });
      const { importClientCertificate } = loadService();

      await expect(importClientCertificate(file, 'secret')).resolves.toEqual({
        ok: true,
        info,
      });

      expect(mockNative.importCertificate).toHaveBeenCalledWith(
        file.uri,
        'secret'
      );
      expect(mockDelete).toHaveBeenCalledTimes(1);
      expect(mockNative.setAllowedHosts).toHaveBeenCalledWith(['a.example']);
    });

    it('keeps the cached copy after a wrong password so it can be retried', async () => {
      mockNative.importCertificate.mockResolvedValue({
        ok: false,
        error: 'wrongPassword',
      });
      const { importClientCertificate } = loadService();

      await expect(importClientCertificate(file, 'nope')).resolves.toEqual({
        ok: false,
        error: 'wrongPassword',
      });
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('reports an unreadable file when the native call throws', async () => {
      mockNative.importCertificate.mockRejectedValue(new Error('boom'));
      const { importClientCertificate } = loadService();

      await expect(importClientCertificate(file, 'x')).resolves.toEqual({
        ok: false,
        error: 'invalidFile',
      });
    });
  });

  describe('shouldSuggestClientCertificate', () => {
    it('is true only while no certificate is stored', () => {
      const { shouldSuggestClientCertificate } = loadService();

      expect(shouldSuggestClientCertificate()).toBe(true);
      mockNative.getCertificateInfo.mockReturnValue({
        subject: 'phone',
        expiresAt: null,
      });
      expect(shouldSuggestClientCertificate()).toBe(false);
    });
  });

  describe('hasClientCertificateGap', () => {
    it('flags a request path the native hook did not find', () => {
      const { hasClientCertificateGap } = loadService();

      expect(hasClientCertificateGap()).toBe(false);
      mockNative.getHookStatus.mockReturnValue({ fetch: true, images: false });
      expect(hasClientCertificateGap()).toBe(true);
    });
  });
});
