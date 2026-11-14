import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveProviderFetchEndpoint } from '../services/providerEndpoint.js';
import { resolveIsAdminByUserId } from '../utils/adminCheck.js';
import {
  createGuardedFetch,
  resolveHostnameForOutboundConnection,
} from '../utils/outboundUrlPolicy.js';

vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../utils/adminCheck', () => ({ resolveIsAdminByUserId: vi.fn() }));
vi.mock('../models/globalSettingsRepository', () => ({
  isPrivateNetworkAiAllowed: vi.fn().mockResolvedValue(false),
  isPrivateNetworkFoodProvidersAllowed: vi.fn().mockResolvedValue(false),
}));
vi.mock('../utils/outboundUrlPolicy', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/outboundUrlPolicy.js')>();
  return {
    ...actual,
    createGuardedFetch: vi.fn(),
    // No real DNS: literal addresses are judged by the shape check alone.
    resolveHostnameForOutboundConnection: vi.fn(async () => undefined),
  };
});

const isAdmin = vi.mocked(resolveIsAdminByUserId);
const guardedFetch = vi.fn();

const row = (base_url: string) => ({
  id: 'p1',
  user_id: 'owner-1',
  base_url,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createGuardedFetch).mockReturnValue(guardedFetch);
});

describe('resolveProviderFetchEndpoint', () => {
  it('gives an admin’s server a fetch that may use the LAN', async () => {
    isAdmin.mockResolvedValue(true);
    await expect(
      resolveProviderFetchEndpoint(row('http://192.168.1.20:8000/mcp'), 'Test')
    ).resolves.toEqual({
      url: 'http://192.168.1.20:8000/mcp',
      fetch: guardedFetch,
    });
    expect(createGuardedFetch).toHaveBeenCalledWith({
      allowPrivateNetwork: true,
      reason: 'admin',
    });
  });

  it('holds anyone else’s server to public addresses', async () => {
    isAdmin.mockResolvedValue(false);
    await expect(
      resolveProviderFetchEndpoint(row('https://tools.example.com/mcp'), 'Test')
    ).resolves.toEqual({
      url: 'https://tools.example.com/mcp',
      fetch: guardedFetch,
    });
    expect(createGuardedFetch).toHaveBeenCalledWith({
      allowPrivateNetwork: false,
      reason: 'public-only',
    });
    await expect(
      resolveProviderFetchEndpoint(row('http://192.168.1.20:8000/mcp'), 'Test')
    ).resolves.toBeNull();
  });

  it('reads a URL saved without a scheme as https', async () => {
    isAdmin.mockResolvedValue(true);
    await expect(
      resolveProviderFetchEndpoint(row(' tools.example.com/mcp '), 'Test')
    ).resolves.toMatchObject({ url: 'https://tools.example.com/mcp' });
  });

  it('refuses a URL that is not a web address', async () => {
    isAdmin.mockResolvedValue(true);
    await expect(
      resolveProviderFetchEndpoint(row('ftp://tools.example.com'), 'Test')
    ).resolves.toBeNull();
    expect(createGuardedFetch).not.toHaveBeenCalled();
  });
});

it('reports DNS failures to callers that need to explain a failed tool listing', async () => {
  isAdmin.mockResolvedValue(false);
  const error = Object.assign(new Error('getaddrinfo ENOTFOUND'), {
    code: 'ENOTFOUND',
  });
  vi.mocked(resolveHostnameForOutboundConnection).mockRejectedValueOnce(error);
  const onFailure = vi.fn();
  await expect(
    resolveProviderFetchEndpoint(row('https://missing.example/mcp'), 'Test', {
      onFailure,
    })
  ).resolves.toBeNull();
  expect(onFailure).toHaveBeenCalledWith(error);
});
