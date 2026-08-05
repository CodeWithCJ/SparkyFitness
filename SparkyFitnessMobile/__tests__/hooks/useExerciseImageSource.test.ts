import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Image } from 'react-native';
import {
  useExerciseImageSource,
  useImagePairAspectMatch,
} from '../../src/hooks/useExerciseImageSource';
import { getActiveServerConfig, proxyHeadersToRecord } from '../../src/services/storage';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.fn(),
}));

jest.mock('../../src/services/api/apiClient', () => ({
  normalizeUrl: (url: string) => url.replace(/\/$/, ''),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    // Simulate focus by calling the callback immediately
    const { useEffect } = require('react');
    useEffect(() => {
      cb();
    }, [cb]);
  },
}));

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;
const mockProxyHeadersToRecord = proxyHeadersToRecord as jest.MockedFunction<
  typeof proxyHeadersToRecord
>;

describe('useExerciseImageSource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProxyHeadersToRecord.mockReturnValue({});
  });

  it('returns null for empty image path', async () => {
    mockGetActiveServerConfig.mockResolvedValue({
      id: 'test',
      url: 'https://example.com',
      apiKey: 'key',
    });

    const { result } = renderHook(() => useExerciseImageSource());

    await act(async () => {});

    expect(result.current.getImageSource('')).toBeNull();
  });

  it('returns absolute URL directly with empty headers', async () => {
    mockGetActiveServerConfig.mockResolvedValue({
      id: 'test',
      url: 'https://example.com',
      apiKey: 'key',
    });

    const { result } = renderHook(() => useExerciseImageSource());

    await act(async () => {});

    const source = result.current.getImageSource('https://cdn.example.com/image.jpg');
    expect(source).toEqual({
      uri: 'https://cdn.example.com/image.jpg',
      headers: {},
    });
  });

  it('returns http URL directly', async () => {
    mockGetActiveServerConfig.mockResolvedValue({
      id: 'test',
      url: 'https://example.com',
      apiKey: 'key',
    });

    const { result } = renderHook(() => useExerciseImageSource());

    await act(async () => {});

    const source = result.current.getImageSource('http://example.com/image.jpg');
    expect(source).toEqual({
      uri: 'http://example.com/image.jpg',
      headers: {},
    });
  });

  it('prepends server URL for relative paths', async () => {
    mockGetActiveServerConfig.mockResolvedValue({
      id: 'test',
      url: 'https://example.com/',
      apiKey: 'key',
      proxyHeaders: [{ key: 'X-Custom', value: 'test' }],
    });
    mockProxyHeadersToRecord.mockReturnValue({ 'X-Custom': 'test' });

    const { result } = renderHook(() => useExerciseImageSource());

    await act(async () => {});

    const source = result.current.getImageSource('bench-press.jpg');
    expect(source).toEqual({
      uri: 'https://example.com/api/uploads/exercises/bench-press.jpg',
      headers: { 'X-Custom': 'test' },
    });
  });

  it('returns null for relative path when no config loaded', () => {
    mockGetActiveServerConfig.mockResolvedValue(null);

    const { result } = renderHook(() => useExerciseImageSource());

    // Config hasn't loaded yet
    expect(result.current.getImageSource('image.jpg')).toBeNull();
  });
});

describe('useImagePairAspectMatch', () => {
  // The hook's effect keys on array identity, so test inputs must be stable
  // across re-renders — same contract the screen meets via useMemo.
  const pair = [
    { uri: 'https://example.com/a.png', headers: {} },
    { uri: 'https://example.com/b.png', headers: {} },
  ];

  let getSizeSpy: jest.SpyInstance;

  beforeEach(() => {
    getSizeSpy = jest.spyOn(Image, 'getSizeWithHeaders');
  });

  afterEach(() => {
    getSizeSpy.mockRestore();
  });

  it('matches a pair whose aspect ratios are close despite resolution differences', async () => {
    getSizeSpy
      .mockResolvedValueOnce({ width: 840, height: 630 })
      .mockResolvedValueOnce({ width: 420, height: 315 });

    const { result } = renderHook(() => useImagePairAspectMatch(pair));

    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('rejects a pair whose aspect ratios differ', async () => {
    getSizeSpy
      .mockResolvedValueOnce({ width: 800, height: 600 })
      .mockResolvedValueOnce({ width: 1600, height: 900 });

    const { result } = renderHook(() => useImagePairAspectMatch(pair));

    await waitFor(() => expect(result.current).toBe(false));
  });

  it('stays undecided when a size lookup fails', async () => {
    getSizeSpy
      .mockResolvedValueOnce({ width: 800, height: 600 })
      .mockRejectedValueOnce(new Error('not found'));

    const { result } = renderHook(() => useImagePairAspectMatch(pair));

    await act(async () => {});
    expect(result.current).toBeUndefined();
  });

  it('stays undecided without measuring when the array is not a pair', async () => {
    const single = [pair[0]];

    const { result } = renderHook(() => useImagePairAspectMatch(single));

    await act(async () => {});
    expect(result.current).toBeUndefined();
    expect(getSizeSpy).not.toHaveBeenCalled();
  });
});
