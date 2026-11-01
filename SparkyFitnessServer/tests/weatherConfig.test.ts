import { vi, beforeEach, describe, expect, it } from 'vitest';
import externalProviderRepository from '../models/externalProviderRepository.js';
import { resolveIsAdminByUserId } from '../utils/adminCheck.js';
import { resolveWeatherProvider } from '../services/weatherConfig.js';

vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../models/externalProviderRepository', () => ({
  default: { getActiveProviderWithKeyByType: vi.fn() },
}));
vi.mock('../utils/adminCheck', () => ({ resolveIsAdminByUserId: vi.fn() }));
vi.mock('../utils/outboundUrlPolicy', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/outboundUrlPolicy.js')>();
  return {
    ...actual,
    // The operator toggles are not under test; only the admin / non-admin split.
    resolveFoodProviderNetworkPolicy: vi.fn(async (isAdmin: boolean) => ({
      allowPrivateNetwork: isAdmin,
    })),
    // No real DNS: literal addresses are judged by the shape check alone.
    resolveHostnameForOutboundConnection: vi.fn(async () => undefined),
  };
});

const getProvider = vi.mocked(
  externalProviderRepository.getActiveProviderWithKeyByType
);
const isAdmin = vi.mocked(resolveIsAdminByUserId);

const row = (base_url: string, app_key: string | null = null) => ({
  id: 'p1',
  user_id: 'owner-1',
  provider_name: 'Weather',
  base_url,
  app_key,
});

beforeEach(() => {
  vi.clearAllMocks();
  isAdmin.mockResolvedValue(false);
});

describe('resolveWeatherProvider', () => {
  it('asks the repository for the open_meteo type as the requesting user', async () => {
    getProvider.mockResolvedValue(null);
    await resolveWeatherProvider('user-1');
    expect(getProvider).toHaveBeenCalledWith('user-1', 'open_meteo');
  });

  it('returns null, so nothing is looked up, when there is no provider', async () => {
    getProvider.mockResolvedValue(null);
    expect(await resolveWeatherProvider('user-1')).toBeNull();
  });

  it('returns the endpoint and the API key of the provider it was given', async () => {
    getProvider.mockResolvedValue(
      row('https://customer-api.open-meteo.com', ' key ')
    );
    const resolved = await resolveWeatherProvider('user-1');
    expect(resolved).toMatchObject({
      url: 'https://customer-api.open-meteo.com',
      apiKey: 'key',
    });
    expect(resolved?.lookup).toBeDefined();
  });

  it('adds https:// to a scheme-less URL and has no key when none is stored', async () => {
    getProvider.mockResolvedValue(row('weather.example.com'));
    expect(await resolveWeatherProvider('user-1')).toMatchObject({
      url: 'https://weather.example.com',
      apiKey: undefined,
    });
  });

  it('refuses a private address that belongs to a non-admin owner', async () => {
    getProvider.mockResolvedValue(row('http://10.0.0.5:8080'));
    expect(await resolveWeatherProvider('user-1')).toBeNull();
    expect(isAdmin).toHaveBeenCalledWith('owner-1');
  });

  it('lets an admin owner use an address on their LAN, without the guarded lookup', async () => {
    isAdmin.mockResolvedValue(true);
    getProvider.mockResolvedValue(row('http://10.0.0.5:8080'));
    expect(await resolveWeatherProvider('user-1')).toMatchObject({
      url: 'http://10.0.0.5:8080',
      lookup: undefined,
    });
  });

  it('refuses a stored URL that is not http(s)', async () => {
    getProvider.mockResolvedValue(row('file:///etc/passwd'));
    expect(await resolveWeatherProvider('user-1')).toBeNull();
  });

  it('returns null instead of throwing when the lookup fails', async () => {
    getProvider.mockRejectedValue(new Error('db down'));
    expect(await resolveWeatherProvider('user-1')).toBeNull();
  });
});
