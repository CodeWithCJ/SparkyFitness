const mockSetConfig = jest.fn();
const mockRefreshShortcut = jest.fn();
jest.mock('../../modules/background-water', () => ({
  __esModule: true,
  default: {
    setConfig: (json: string | null) => mockSetConfig(json),
    refreshShortcut: (shortLabel: string, longLabel: string) =>
      mockRefreshShortcut(shortLabel, longLabel),
  },
}));
const mockGetActiveServerConfig = jest.fn();
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: () => mockGetActiveServerConfig(),
  proxyHeadersToRecord: (headers?: { name: string; value: string }[]) =>
    Object.fromEntries((headers ?? []).map((h) => [h.name, h.value])),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

import { addLog } from '../../src/services/LogService';
import {
  buildBackgroundWaterConfig,
  drinkVolumeLabel,
  clearBackgroundWater,
  refreshBackgroundWaterShortcut,
  syncBackgroundWater,
} from '../../src/services/backgroundWater';

const container = { id: 3, name: 'Bottle', volume: 500, unit: 'ml' };
// 946.352 ml is 32 fl oz; two servings makes one drink 16 oz.
const owala = {
  id: 7,
  name: 'Owala',
  volume: 946.352,
  unit: 'oz',
  servings_per_container: 2,
};
it('labels one serving in the container unit', () => {
  expect(drinkVolumeLabel(owala)).toBe('16 oz');
});

const server = {
  id: 's1',
  url: 'https://sparky.example.com/',
  apiKey: 'key-123',
  authType: 'apiKey' as const,
  proxyHeaders: [{ name: 'X-Proxy', value: 'abc' }],
};

describe('background water', () => {
  beforeEach(() => {
    mockSetConfig.mockReset();
    mockRefreshShortcut.mockReset();
    mockGetActiveServerConfig.mockReset();
  });

  it('builds the config the native shortcut posts with', () => {
    expect(buildBackgroundWaterConfig(server, container)).toEqual({
      serverId: 's1',
      baseUrl: 'https://sparky.example.com',
      headers: {
        'X-Proxy': 'abc',
        Authorization: 'Bearer key-123',
        'X-Meal-Model-Version': '2',
      },
      containerId: 3,
      containerName: 'Bottle',
      volumeLabel: '500 ml',
      weightUnit: 'kg',
    });
  });

  it('still builds a config, in the user weight unit, with no container', () => {
    const config = buildBackgroundWaterConfig(server, undefined, 'lbs');
    expect(config).toMatchObject({ weightUnit: 'lbs' });
    expect(config).not.toHaveProperty('containerId');
  });

  it('has no config without a signed-in server', () => {
    expect(buildBackgroundWaterConfig(null, container)).toBeNull();
  });

  it('stores the config for the signed-in server and container', async () => {
    mockGetActiveServerConfig.mockResolvedValue(server);
    await syncBackgroundWater(container);
    expect(JSON.parse(mockSetConfig.mock.calls[0][0]).containerId).toBe(3);
  });

  it('erases the copy when no server is signed in', async () => {
    mockGetActiveServerConfig.mockResolvedValue(null);
    await syncBackgroundWater(container);
    expect(mockSetConfig).toHaveBeenLastCalledWith(null);
  });

  it('keeps the actions working with no container, and erases on request', async () => {
    mockGetActiveServerConfig.mockResolvedValue(server);
    await syncBackgroundWater(undefined, 'lbs');
    expect(JSON.parse(mockSetConfig.mock.calls[0][0]).weightUnit).toBe('lbs');
    await clearBackgroundWater();
    expect(mockSetConfig).toHaveBeenLastCalledWith(null);
  });

  it('puts the launcher shortcut back with the labels it is given', async () => {
    await refreshBackgroundWaterShortcut('Registrar agua', 'Sin abrir la app');
    expect(mockRefreshShortcut).toHaveBeenCalledWith(
      'Registrar agua',
      'Sin abrir la app'
    );
  });

  it('restores the shortcut only after a clear asked for before it', async () => {
    const order: string[] = [];
    mockSetConfig.mockImplementation(() => order.push('clear'));
    mockRefreshShortcut.mockImplementation(() => order.push('refresh'));
    await Promise.all([
      clearBackgroundWater(),
      refreshBackgroundWaterShortcut(
        'Log water',
        'Log water in the background'
      ),
    ]);
    expect(order).toEqual(['clear', 'refresh']);
  });

  it('logs rather than throws when the shortcut cannot be restored', async () => {
    mockRefreshShortcut.mockImplementation(() => {
      throw new Error('launcher refused');
    });
    await expect(
      refreshBackgroundWaterShortcut('Log water', 'Log water in the background')
    ).resolves.toBeUndefined();
    expect(addLog).toHaveBeenCalledWith(
      expect.stringContaining('launcher refused'),
      'WARNING'
    );
  });
});
