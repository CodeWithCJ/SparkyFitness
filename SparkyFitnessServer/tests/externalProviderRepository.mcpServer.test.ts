import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGlobalExternalDataProvider,
  getActiveMcpServers,
  getExternalDataProviderByUserIdAndProviderName,
  getExternalDataProviderById,
  getExternalDataProviders,
  getExternalDataProvidersByUserId,
  getGlobalExternalDataProviders,
  updateGlobalExternalDataProvider,
} from '../models/externalProviderRepository.js';
import { getClient, getSystemClient } from '../db/poolManager.js';
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

const OPTIONS = {
  allowed_tools: [{ name: 'solve_shake', fingerprint: 'a'.repeat(64) }],
  send_user_id: true,
};

describe('externalProviderRepository MCP tool servers', () => {
  const query = vi.fn();
  const release = vi.fn();

  beforeEach(() => {
    query.mockResolvedValue({ rows: [] });
    vi.mocked(getClient).mockResolvedValue({ query, release } as never);
    vi.mocked(getSystemClient).mockResolvedValue({ query, release } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['the list a person sees', 2, () => getExternalDataProviders('user-1')],
    [
      'the list of one owner’s rows',
      2,
      () => getExternalDataProvidersByUserId('user-1', 'user-1'),
    ],
    [
      'the lookup by name',
      3,
      () => getExternalDataProviderByUserIdAndProviderName('user-1', 'garmin'),
    ],
  ])('leaves tool servers out of %s', async (_name, position, read) => {
    await read();
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain(`edp.provider_type <> $${position}`);
    expect(params[position - 1]).toBe('mcp_server');
  });

  it('keeps every visibility rule inside the type filter', async () => {
    await getExternalDataProviders('user-1');
    const [sql] = query.mock.calls[0];
    // Without the brackets, AND would bind to the family branch alone and the
    // public branch would still return tool servers.
    expect(sql).toMatch(
      /WHERE \(\s+edp\.user_id = \$1\s+OR \(edp\.is_public = TRUE AND edp\.is_active = TRUE\)\s+OR [^\n]+\n\s+\)\s+AND edp\.provider_type <> \$2/
    );
  });

  it('reads saved options by ID so a URL change preserves send_user_id', async () => {
    query.mockResolvedValue({
      rows: [{ id: 'provider-1', provider_options: OPTIONS }],
    });
    await expect(
      getExternalDataProviderById('provider-1')
    ).resolves.toMatchObject({ provider_options: OPTIONS });
    expect(query.mock.calls[0][0]).toContain('edp.provider_options');
  });

  it.each([
    { encrypted_app_key: 'ciphertext', has_app_key: true },
    { encrypted_app_key: null, has_app_key: false },
  ])(
    'reports stored token presence independently of decryption ($has_app_key)',
    async ({ encrypted_app_key, has_app_key }) => {
      vi.mocked(decrypt).mockRejectedValue(new Error('bad key'));
      query.mockResolvedValue({
        rows: [
          {
            id: 'provider-1',
            encrypted_app_key,
            app_key_iv: 'iv',
            app_key_tag: 'tag',
          },
        ],
      });

      await expect(
        getExternalDataProviderById('provider-1')
      ).resolves.toMatchObject({ app_key: null, has_app_key });
      expect(decrypt).toHaveBeenCalledTimes(has_app_key ? 1 : 0);
    }
  );

  it('shows the options on the admin list', async () => {
    await getGlobalExternalDataProviders();
    expect(query.mock.calls[0][0]).toContain('edp.provider_options');
  });

  it('stores the options when a global provider is created', async () => {
    query.mockResolvedValue({ rows: [{ id: 'provider-1' }] });
    await createGlobalExternalDataProvider({
      provider_name: 'Household tools',
      provider_type: 'mcp_server',
      user_id: 'admin-1',
      provider_options: OPTIONS,
    });
    expect(query.mock.calls[0][1][12]).toBe(JSON.stringify(OPTIONS));
  });

  it('stores nothing for a provider without options', async () => {
    query.mockResolvedValue({ rows: [{ id: 'provider-1' }] });
    await createGlobalExternalDataProvider({
      provider_name: 'USDA',
      provider_type: 'usda',
      user_id: 'admin-1',
    });
    expect(query.mock.calls[0][1][12]).toBeNull();
  });

  it('leaves stored options alone unless an update brings new ones', async () => {
    query.mockResolvedValue({ rows: [{ id: 'provider-1' }] });
    await updateGlobalExternalDataProvider('provider-1', { is_active: true });
    expect(query.mock.calls[0][0]).toContain(
      'provider_options = COALESCE($16::jsonb, provider_options)'
    );
    expect(query.mock.calls[0][1][15]).toBeNull();

    await updateGlobalExternalDataProvider('provider-1', {
      provider_options: OPTIONS,
    });
    expect(query.mock.calls[1][1][15]).toBe(JSON.stringify(OPTIONS));
  });

  describe('the servers chat may use', () => {
    const stored = {
      id: 'provider-1',
      user_id: 'admin-1',
      provider_name: 'Household tools',
      base_url: 'http://192.168.1.20:8000/mcp',
      provider_options: OPTIONS,
      updated_at: new Date('2026-11-10T00:00:00Z'),
    };
    const key = {
      encrypted_app_key: 'encrypted',
      app_key_iv: 'iv',
      app_key_tag: 'tag',
    };

    it('reads only active global tool servers, in a fixed order', async () => {
      await getActiveMcpServers();
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('edp.provider_type = $1');
      expect(sql).toContain('edp.is_public = TRUE');
      expect(sql).toContain('edp.is_active = TRUE');
      expect(sql).toContain('ORDER BY edp.provider_name ASC, edp.id ASC');
      expect(params).toEqual(['mcp_server']);
      expect(getSystemClient).toHaveBeenCalled();
      expect(getClient).not.toHaveBeenCalled();
    });

    it('returns each server with its token decrypted', async () => {
      vi.mocked(decrypt).mockResolvedValue('t0ken');
      query.mockResolvedValue({ rows: [{ ...stored, ...key }] });
      await expect(getActiveMcpServers()).resolves.toEqual([
        { ...stored, app_key: 't0ken' },
      ]);
    });

    it('returns a server without a token when it has none or it cannot be read', async () => {
      vi.mocked(decrypt).mockRejectedValue(new Error('bad key'));
      query.mockResolvedValue({
        rows: [
          { ...stored, ...key },
          {
            ...stored,
            id: 'provider-2',
            encrypted_app_key: null,
            app_key_iv: null,
            app_key_tag: null,
          },
        ],
      });
      await expect(getActiveMcpServers()).resolves.toEqual([
        { ...stored, app_key: null },
        { ...stored, id: 'provider-2', app_key: null },
      ]);
    });
  });
});
