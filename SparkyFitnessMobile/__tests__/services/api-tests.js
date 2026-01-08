jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
}));

import { syncHealthData, checkServerConnection } from '../../src/services/api';
import { getActiveServerConfig } from '../../src/services/storage';

describe('api.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  describe('syncHealthData', () => {
    const validConfig = {
      url: 'https://api.example.com',
      apiKey: 'test-api-key-123',
    };

    const testData = [
      { type: 'step', date: '2024-01-15', value: 1000 },
    ];

    it('successful sync with valid config', async () => {
      getActiveServerConfig.mockResolvedValue(validConfig);
      global.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
      });

      const result = await syncHealthData(testData);

      expect(result).toEqual({ success: true });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('throws when no server config', async () => {
      getActiveServerConfig.mockResolvedValue(null);

      await expect(syncHealthData(testData)).rejects.toThrow(
        'Server configuration not found.'
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('throws when config has undefined url', async () => {
      // url.endsWith will throw TypeError if url is undefined
      const configWithUndefinedUrl = { apiKey: 'test-api-key' };
      getActiveServerConfig.mockResolvedValue(configWithUndefinedUrl);

      await expect(syncHealthData(testData)).rejects.toThrow();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('throws on non-2xx response with error details', async () => {
      getActiveServerConfig.mockResolvedValue(validConfig);
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Internal Server Error'),
      });

      await expect(syncHealthData(testData)).rejects.toThrow(
        'Server error: 500 - Internal Server Error'
      );
    });

    it('sends correct Authorization header', async () => {
      getActiveServerConfig.mockResolvedValue(validConfig);
      global.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
      });

      await syncHealthData(testData);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key-123',
          }),
        })
      );
    });

    it('strips trailing slash from URL', async () => {
      const configWithTrailingSlash = {
        url: 'https://api.example.com/',
        apiKey: 'test-api-key-123',
      };
      getActiveServerConfig.mockResolvedValue(configWithTrailingSlash);
      global.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
      });

      await syncHealthData(testData);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/health-data',
        expect.any(Object)
      );
    });

    it('sends data as JSON body', async () => {
      getActiveServerConfig.mockResolvedValue(validConfig);
      global.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
      });

      await syncHealthData(testData);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(testData),
        })
      );
    });

    it('rethrows on network error', async () => {
      getActiveServerConfig.mockResolvedValue(validConfig);
      global.fetch.mockRejectedValue(new Error('Network error'));

      await expect(syncHealthData(testData)).rejects.toThrow('Network error');
    });
  });

  describe('checkServerConnection', () => {
    const validConfig = {
      url: 'https://api.example.com',
      apiKey: 'test-api-key-123',
    };

    it('returns true on 200 response', async () => {
      getActiveServerConfig.mockResolvedValue(validConfig);
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await checkServerConnection();

      expect(result).toBe(true);
    });

    it('returns false when no config (does not throw)', async () => {
      getActiveServerConfig.mockResolvedValue(null);

      const result = await checkServerConnection();

      expect(result).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns false when config has no url (does not throw)', async () => {
      getActiveServerConfig.mockResolvedValue({ apiKey: 'test' });

      const result = await checkServerConnection();

      expect(result).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns false on 401 response (does not throw)', async () => {
      getActiveServerConfig.mockResolvedValue(validConfig);
      global.fetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue('Unauthorized'),
      });

      const result = await checkServerConnection();

      expect(result).toBe(false);
    });

    it('returns false on 403 response (does not throw)', async () => {
      getActiveServerConfig.mockResolvedValue(validConfig);
      global.fetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: jest.fn().mockResolvedValue('Forbidden'),
      });

      const result = await checkServerConnection();

      expect(result).toBe(false);
    });

    it('returns false on network error (does not throw)', async () => {
      getActiveServerConfig.mockResolvedValue(validConfig);
      global.fetch.mockRejectedValue(new Error('Network error'));

      const result = await checkServerConnection();

      expect(result).toBe(false);
    });

    it('uses /auth/user endpoint', async () => {
      getActiveServerConfig.mockResolvedValue(validConfig);
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await checkServerConnection();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/auth/user',
        expect.any(Object)
      );
    });

    it('strips trailing slash from URL', async () => {
      const configWithTrailingSlash = {
        url: 'https://api.example.com/',
        apiKey: 'test-api-key-123',
      };
      getActiveServerConfig.mockResolvedValue(configWithTrailingSlash);
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await checkServerConnection();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/auth/user',
        expect.any(Object)
      );
    });
  });
});
