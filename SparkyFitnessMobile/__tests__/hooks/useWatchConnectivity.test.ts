import { renderHook } from '@testing-library/react-native';

const mockNative = { supported: true, paired: true };

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    isSupported: () => mockNative.supported,
    isPaired: () => mockNative.paired,
    isReachable: () => false,
    addListener: () => ({ remove: jest.fn() }),
  },
}));

import { useWatchConnectivity } from '../../src/hooks/useWatchConnectivity';

describe('useWatchConnectivity', () => {
  beforeEach(() => {
    mockNative.supported = true;
    mockNative.paired = true;
  });

  it('reports support and pairing from the native module', () => {
    const { result } = renderHook(() => useWatchConnectivity());

    expect(result.current.isSupported).toBe(true);
    expect(result.current.isPaired).toBe(true);
  });

  it('is not supported when the native module says so, even with a cached pairing', () => {
    mockNative.supported = false;
    const { result } = renderHook(() => useWatchConnectivity());

    expect(result.current.isSupported).toBe(false);
    expect(result.current.isPaired).toBe(true);
  });
});
