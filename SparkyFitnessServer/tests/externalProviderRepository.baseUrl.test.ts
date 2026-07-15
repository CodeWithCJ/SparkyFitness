import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  updateExternalDataProvider,
  updateGlobalExternalDataProvider,
} from '../models/externalProviderRepository.js';
import { getClient, getSystemClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));

vi.mock('../security/encryption.js', () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  ENCRYPTION_KEY: 'test-key',
}));

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

describe('externalProviderRepository base_url clearing', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 'provider-1' }] }),
      release: vi.fn(),
    };
    // @ts-expect-error mock typing
    getClient.mockResolvedValue(mockClient);
    // @ts-expect-error mock typing
    getSystemClient.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('updateExternalDataProvider passes clearBaseUrl=true when base_url is explicitly null', async () => {
    await updateExternalDataProvider('provider-1', 'user-1', {
      base_url: null,
    });

    const [query, params] = mockClient.query.mock.calls[0];
    expect(query).toContain(
      'base_url = CASE WHEN $23 THEN NULL ELSE COALESCE($4, base_url) END'
    );
    expect(params[3]).toBeNull(); // $4 base_url value
    expect(params[22]).toBe(true); // $23 clearBaseUrl flag
  });

  it('updateExternalDataProvider passes clearBaseUrl=false when base_url is left untouched', async () => {
    await updateExternalDataProvider('provider-1', 'user-1', {
      is_active: true,
    });

    const [, params] = mockClient.query.mock.calls[0];
    expect(params[3]).toBeUndefined(); // $4 base_url value
    expect(params[22]).toBe(false); // $23 clearBaseUrl flag
  });

  it('updateExternalDataProvider passes the new value and clearBaseUrl=false when setting a custom base_url', async () => {
    await updateExternalDataProvider('provider-1', 'user-1', {
      base_url: 'http://sparkyfitness-foodfacts:8080',
    });

    const [, params] = mockClient.query.mock.calls[0];
    expect(params[3]).toBe('http://sparkyfitness-foodfacts:8080');
    expect(params[22]).toBe(false);
  });

  it('updateGlobalExternalDataProvider passes clearBaseUrl=true when base_url is explicitly null', async () => {
    await updateGlobalExternalDataProvider('provider-1', { base_url: null });

    const [query, params] = mockClient.query.mock.calls[0];
    expect(query).toContain(
      'base_url = CASE WHEN $15 THEN NULL ELSE COALESCE($4, base_url) END'
    );
    expect(params[3]).toBeNull(); // $4 base_url value
    expect(params[14]).toBe(true); // $15 clearBaseUrl flag
  });

  it('updateGlobalExternalDataProvider passes clearBaseUrl=false when setting a custom base_url', async () => {
    await updateGlobalExternalDataProvider('provider-1', {
      base_url: 'http://sparkyfitness-foodfacts:8080',
    });

    const [, params] = mockClient.query.mock.calls[0];
    expect(params[3]).toBe('http://sparkyfitness-foodfacts:8080');
    expect(params[14]).toBe(false);
  });
});
