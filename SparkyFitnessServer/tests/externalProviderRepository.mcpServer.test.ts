import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGlobalExternalDataProvider,
  getExternalDataProviderByUserIdAndProviderName,
  getExternalDataProviders,
  getExternalDataProvidersByUserId,
  getGlobalExternalDataProviders,
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

const OPTIONS = { allowed_tools: ['solve_shake'], send_user_id: true };

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
});
