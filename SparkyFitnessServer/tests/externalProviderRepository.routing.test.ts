import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getActiveProviderWithKeyByType } from '../models/externalProviderRepository.js';
import { getClient } from '../db/poolManager.js';
import { decrypt } from '../security/encryption.js';

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

describe('getActiveProviderWithKeyByType', () => {
  const query = vi.fn();
  const release = vi.fn();

  beforeEach(() => {
    vi.mocked(getClient).mockResolvedValue({ query, release } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reads as the user (RLS) and prefers their own provider', async () => {
    query.mockResolvedValue({ rows: [] });
    await getActiveProviderWithKeyByType('user-1', 'valhalla');
    expect(getClient).toHaveBeenCalledWith('user-1');
    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual(['user-1', 'valhalla']);
    expect(sql).toContain('(edp.user_id = $1) DESC');
    // Then public before family-shared: sort_order is per owner, so it cannot
    // decide between tiers.
    expect(sql).toMatch(
      /\(edp\.user_id = \$1\) DESC, edp\.is_public DESC, edp\.sort_order/
    );
    expect(sql).toContain('edp.is_active = TRUE');
    // Public and family-shared rows follow the same visibility as the list.
    expect(sql).toContain('edp.is_public = TRUE');
    expect(sql).toContain(
      "has_family_access(edp.user_id, 'share_external_providers')"
    );
    expect(release).toHaveBeenCalled();
  });

  it('returns null when nothing matches', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await getActiveProviderWithKeyByType('u', 'valhalla')).toBeNull();
  });

  it('decrypts the key and returns no storage columns', async () => {
    vi.mocked(decrypt).mockResolvedValue('plain-key');
    query.mockResolvedValue({
      rows: [
        {
          id: 'p1',
          user_id: 'owner',
          provider_name: 'Routing',
          base_url: 'https://valhalla.example.org',
          encrypted_app_key: 'enc',
          app_key_iv: 'iv',
          app_key_tag: 'tag',
        },
      ],
    });
    const row = await getActiveProviderWithKeyByType('u', 'valhalla');
    expect(row).toEqual({
      id: 'p1',
      user_id: 'owner',
      provider_name: 'Routing',
      base_url: 'https://valhalla.example.org',
      app_key: 'plain-key',
    });
    expect(decrypt).toHaveBeenCalledWith('enc', 'iv', 'tag', 'test-key');
  });

  it('has no key for a server without one', async () => {
    query.mockResolvedValue({
      rows: [
        {
          id: 'p1',
          user_id: 'owner',
          provider_name: 'Routing',
          base_url: 'https://valhalla.example.org',
          encrypted_app_key: null,
          app_key_iv: null,
          app_key_tag: null,
        },
      ],
    });
    const row = await getActiveProviderWithKeyByType('u', 'valhalla');
    expect(row?.app_key).toBeNull();
    expect(decrypt).not.toHaveBeenCalled();
  });
});
