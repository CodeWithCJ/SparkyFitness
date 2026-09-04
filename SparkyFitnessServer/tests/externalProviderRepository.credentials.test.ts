import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createExternalDataProvider,
  createGlobalExternalDataProvider,
  getExternalDataProviders,
  getExternalDataProvidersByUserId,
} from '../models/externalProviderRepository.js';
import { getClient, getSystemClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../security/encryption.js', () => ({
  encrypt: vi.fn().mockResolvedValue({
    encryptedText: 'ciphertext',
    iv: 'iv',
    tag: 'tag',
  }),
  decrypt: vi.fn(),
  ENCRYPTION_KEY: 'test-key',
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const mockClient = {
  query: vi.fn().mockResolvedValue({ rows: [{ id: 'provider-1' }] }),
  release: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockClient.query.mockResolvedValue({ rows: [{ id: 'provider-1' }] });
  vi.mocked(getClient).mockResolvedValue(mockClient as never);
  vi.mocked(getSystemClient).mockResolvedValue(mockClient as never);
});

describe('external provider credential storage responses', () => {
  it('sets separate target and authenticated actor identities for provider reads', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await getExternalDataProviders('owner-1', 'delegate-2');

    expect(getClient).toHaveBeenCalledWith('owner-1', 'delegate-2');
  });

  it('sets separate target and authenticated actor identities for explicit target reads', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await getExternalDataProvidersByUserId('delegate-2', 'owner-1');

    expect(getClient).toHaveBeenCalledWith('owner-1', 'delegate-2');
  });

  it('never logs plaintext provider credentials and returns no encrypted columns', async () => {
    await createExternalDataProvider({
      provider_name: 'My Open Food Facts',
      provider_type: 'openfoodfacts',
      user_id: 'user-1',
      is_active: true,
      app_id: 'off-user',
      app_key: 'super-secret-password',
    });

    expect(log).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ app_key: 'super-secret-password' })
    );
    const query = mockClient.query.mock.calls[0]?.[0] as string;
    expect(query).not.toContain('RETURNING *');
    expect(query).toContain('RETURNING id');
  });

  it('keeps global provider mutation responses free of encrypted credentials', async () => {
    await createGlobalExternalDataProvider({
      provider_name: 'Global Open Food Facts',
      provider_type: 'openfoodfacts',
      user_id: 'admin-1',
      is_active: true,
      app_id: 'off-user',
      app_key: 'super-secret-password',
    });

    const query = mockClient.query.mock.calls[0]?.[0] as string;
    expect(query).not.toContain('RETURNING *');
    expect(query).toContain('RETURNING id');
  });
});
