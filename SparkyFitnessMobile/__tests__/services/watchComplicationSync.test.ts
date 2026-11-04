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
