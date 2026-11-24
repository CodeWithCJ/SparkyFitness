import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import WatchConnectivity from '../../modules/watch-connectivity';
import { sendComplicationsToWatch } from '../../src/services/watchComplicationSync';
import type { WatchComplicationDefinition } from '../../src/utils/watchComplications';

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    sendComplicationConfig: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const module = WatchConnectivity as unknown as {
  sendComplicationConfig: jest.Mock;
};

const water: WatchComplicationDefinition = {
  id: 'w',
  name: 'Water',
  source: 'water',
  format: 'percent',
  gauge: true,
  color: 'water',
  icon: 'drop.fill',
};

const originalOS = Platform.OS;
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { value: originalOS });
});

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { value: 'ios' });
});

describe('sendComplicationsToWatch', () => {
  it('queues the list as a complication config', async () => {
    await sendComplicationsToWatch([water]);
    expect(module.sendComplicationConfig).toHaveBeenCalledTimes(1);
    const sent = module.sendComplicationConfig.mock.calls[0][0];
    expect(sent.definitions).toEqual([
      expect.objectContaining({ id: 'w', name: 'Water', source: 'water' }),
    ]);
    expect(typeof sent.revision).toBe('number');
  });

  it('keeps each revision above the last one when the clock moves back', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(5_000_000_000_000);
    await sendComplicationsToWatch([water]);
    now.mockReturnValue(1_000);
    await sendComplicationsToWatch([water]);
    now.mockRestore();
    const [first, second] = module.sendComplicationConfig.mock.calls.map(
      (call) => call[0].revision
    );
    expect(second).toBeGreaterThan(first);
  });

  it('keeps the revision above the last one sent before a restart', async () => {
    await AsyncStorage.setItem(
      'watchComplicationLastRevision',
      '9000000000000'
    );
    jest.isolateModules(() => {
      jest.doMock('../../modules/watch-connectivity', () => ({
        __esModule: true,
        default: module,
      }));
    });
    let fresh: typeof import('../../src/services/watchComplicationSync');
    jest.isolateModules(() => {
      fresh = require('../../src/services/watchComplicationSync');
    });
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    await fresh!.sendComplicationsToWatch([water]);
    jest.restoreAllMocks();
    expect(
      module.sendComplicationConfig.mock.calls[0][0].revision
    ).toBeGreaterThan(9_000_000_000_000);
  });

  it('marks a manual reload so the watch refreshes its picker', async () => {
    await sendComplicationsToWatch([water], { reload: true });
    expect(module.sendComplicationConfig.mock.calls[0][0].reload).toBe(true);
  });

  it('sends the built-in styles with the list', async () => {
    await sendComplicationsToWatch([water], {
      builtIns: { steps: { color: 'heart' } },
    });
    expect(module.sendComplicationConfig.mock.calls[0][0].builtIns).toEqual([
      { key: 'steps', color: 'heart' },
    ]);
  });

  it('leaves the reload flag off for an ordinary send', async () => {
    await sendComplicationsToWatch([water]);
    expect(module.sendComplicationConfig.mock.calls[0][0]).not.toHaveProperty(
      'reload'
    );
  });

  it('sends nothing on Android, whose module has no such message', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    await sendComplicationsToWatch([water]);
    expect(module.sendComplicationConfig).not.toHaveBeenCalled();
  });

  it('reports a failed send to the caller', async () => {
    module.sendComplicationConfig.mockRejectedValueOnce(new Error('boom'));
    await expect(sendComplicationsToWatch([water])).rejects.toThrow('boom');
  });
});
