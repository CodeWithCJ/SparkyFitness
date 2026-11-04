import { renderHook } from '@testing-library/react-native';
import { useWatchComplicationSync } from '../../src/hooks/useWatchComplicationSync';
import { sendComplicationsToWatch } from '../../src/services/watchComplicationSync';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';

type Listener = (payload: unknown) => void;
const mockListeners = new Map<string, Listener>();

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    addListener: (name: string, fn: Listener) => {
      mockListeners.set(name, fn);
      return { remove: () => mockListeners.delete(name) };
    },
  },
}));
jest.mock('../../src/services/watchComplicationSync', () => ({
  sendComplicationsToWatch: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const mine = {
  id: 'c1',
  name: 'Caffeine',
  source: 'nutrient:caffeine',
  format: 'percent',
  gauge: true,
  color: 'neutral',
  icon: 'cup',
} as never;

describe('useWatchComplicationSync', () => {
  beforeEach(() => {
    mockListeners.clear();
    jest.clearAllMocks();
    useAppPreferencesStore.setState({ watchComplications: [mine] });
  });

  it('sends the list once on start', () => {
    renderHook(() => useWatchComplicationSync(true));
    expect(sendComplicationsToWatch).toHaveBeenCalledTimes(1);
    const sent = (sendComplicationsToWatch as jest.Mock).mock.calls[0][0];
    expect(sent.map((d: { name: string }) => d.name)).toEqual(['Caffeine']);
  });

  it('sends the list again when the watch asks for its state', () => {
    renderHook(() => useWatchComplicationSync(true));
    mockListeners.get('onContextRequest')?.(undefined);
    expect(sendComplicationsToWatch).toHaveBeenCalledTimes(2);
    const resent = (sendComplicationsToWatch as jest.Mock).mock.calls[1][0];
    expect(resent.map((d: { name: string }) => d.name)).toEqual(['Caffeine']);
  });

  it('sends the list again when the watch becomes reachable, not when it leaves', () => {
    renderHook(() => useWatchComplicationSync(true));
    mockListeners.get('onReachabilityChange')?.({ isReachable: false });
    expect(sendComplicationsToWatch).toHaveBeenCalledTimes(1);
    mockListeners.get('onReachabilityChange')?.({ isReachable: true });
    expect(sendComplicationsToWatch).toHaveBeenCalledTimes(2);
  });

  it('does nothing while disabled', () => {
    renderHook(() => useWatchComplicationSync(false));
    expect(sendComplicationsToWatch).not.toHaveBeenCalled();
    expect(mockListeners.size).toBe(0);
  });
});
