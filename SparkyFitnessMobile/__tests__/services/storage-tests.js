import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage');

import {
  saveServerConfig,
  getActiveServerConfig,
  deleteServerConfig,
  getAllServerConfigs,
} from '../../src/services/storage';

describe('Storage Service', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('stores config and sets it as active', async () => {
    const config = {
      id: '123',
      serverUrl: 'https://example.com',
      apiKey: 'abc',
    };

    await saveServerConfig(config);

    const active = await getActiveServerConfig();
    expect(active).toEqual(config);
  });

  it('clears active if deleted config was active', async () => {
    const config = {
      id: '123',
      serverUrl: 'https://example.com',
      apiKey: 'abc',
    };
    await saveServerConfig(config);

    await deleteServerConfig('123');

    const active = await getActiveServerConfig();
    expect(active).toBeNull();
  });

  it('is null if no active config is set', async () => {
    const active = await getActiveServerConfig();
    expect(active).toBeNull();
  });

  it('should update active config when a new config is saved', async () => {
    const config1 = {
      id: '123',
      serverUrl: 'https://example.com',
      apiKey: 'abc',
    };
    const config2 = {
      id: '456',
      serverUrl: 'https://example.org',
      apiKey: 'def',
    };

    await saveServerConfig(config1);
    let active = await getActiveServerConfig();
    expect(active).toEqual(config1);

    await saveServerConfig(config2);
    active = await getActiveServerConfig();
    expect(active).toEqual(config2);
  });

  it('does not create duplicate configs', async () => {
    const config = {
      id: '123',
      serverUrl: 'https://example.com',
      apiKey: 'abc',
    };

    await saveServerConfig(config);
    await saveServerConfig(config); // Save the same config again
    const allConfigs = await getAllServerConfigs();

    // There should only be one config stored
    expect(allConfigs.length).toBe(1);
  });
});
