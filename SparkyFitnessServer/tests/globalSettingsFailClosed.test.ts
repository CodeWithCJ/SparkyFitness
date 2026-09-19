import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/poolManager.js', () => ({
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { getSystemClient } from '../db/poolManager.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';

const mockGetSystemClient = vi.mocked(getSystemClient);

/**
 * These policy lookups sit on request paths, so an unreachable database must
 * deny rather than throw a connection error into the caller. Regression cover
 * for a pool rejection escaping the catch when the client was acquired before
 * the try block.
 */
describe('global settings policy lookups with the database unreachable', () => {
  const lookups = [
    'isPrivateNetworkAiAllowed',
    'isPrivateNetworkFoodProvidersAllowed',
    'isPublicApiDocsAllowed',
    'isDevToolsEnabled',
    'isMockDataEnabled',
  ] as const;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(lookups)('%s resolves false when the pool rejects', async (name) => {
    mockGetSystemClient.mockRejectedValue(
      new Error('connect ECONNREFUSED 127.0.0.1:5432')
    );
    await expect(globalSettingsRepository[name]()).resolves.toBe(false);
  });

  it.each(lookups)('%s resolves false when the query throws', async (name) => {
    const release = vi.fn();
    mockGetSystemClient.mockResolvedValue({
      query: vi.fn().mockRejectedValue(new Error('column does not exist')),
      release,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    await expect(globalSettingsRepository[name]()).resolves.toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('returns the stored value and releases the client on the happy path', async () => {
    const release = vi.fn();
    mockGetSystemClient.mockResolvedValue({
      query: vi.fn().mockResolvedValue({
        rows: [{ mock_data_enabled: true }],
      }),
      release,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    await expect(globalSettingsRepository.isMockDataEnabled()).resolves.toBe(
      true
    );
    expect(release).toHaveBeenCalledTimes(1);
  });
});
