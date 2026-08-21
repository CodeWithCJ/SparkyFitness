import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Image, type ImageRef } from 'expo-image';
import {
  useExerciseImageSource,
  useImagePairAspectMatch,
} from '../../src/hooks/useExerciseImageSource';
import {
  getActiveServerConfig,
  proxyHeadersToRecord,
} from '../../src/services/storage';

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

    const source = result.current.getImageSource(
      'https://cdn.example.com/image.jpg',
    );
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

    const source = result.current.getImageSource(
      'http://example.com/image.jpg',
    );
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

  it('does not double-prefix an already server-rooted path', async () => {
    // CSV imports persist downloadImage's return value verbatim, so the stored
    // value already carries `/uploads/exercises/`.
    mockGetActiveServerConfig.mockResolvedValue({
      id: 'test',
      url: 'https://example.com/',
      apiKey: 'key',
      proxyHeaders: [{ key: 'X-Custom', value: 'test' }],
    });
    mockProxyHeadersToRecord.mockReturnValue({ 'X-Custom': 'test' });

    const { result } = renderHook(() => useExerciseImageSource());

    await act(async () => {});

    const source = result.current.getImageSource(
      '/uploads/exercises/Bench_Press/0_ab12cd34.jpg',
    );
    expect(source).toEqual({
      uri: 'https://example.com/api/uploads/exercises/Bench_Press/0_ab12cd34.jpg',
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

  const makeRef = (width: number, height: number) =>
    ({ width, height, release: jest.fn() } as unknown as ImageRef);

  let loadSpy: jest.SpyInstance;

  beforeEach(() => {
    loadSpy = jest.spyOn(Image, 'loadAsync');
  });

  afterEach(() => {
    loadSpy.mockRestore();
  });

  it('matches a pair whose aspect ratios are close despite resolution differences', async () => {
    loadSpy
      .mockResolvedValueOnce(makeRef(840, 630))
      .mockResolvedValueOnce(makeRef(420, 315));

    const { result } = renderHook(() => useImagePairAspectMatch(pair));

    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('rejects a pair whose aspect ratios differ', async () => {
    loadSpy
      .mockResolvedValueOnce(makeRef(800, 600))
      .mockResolvedValueOnce(makeRef(1600, 900));

    const { result } = renderHook(() => useImagePairAspectMatch(pair));

    await waitFor(() => expect(result.current).toBe(false));
  });

  it('releases the loaded image refs once measured', async () => {
    const refA = makeRef(800, 600);
    const refB = makeRef(400, 300);
    loadSpy.mockResolvedValueOnce(refA).mockResolvedValueOnce(refB);

    const { result } = renderHook(() => useImagePairAspectMatch(pair));

    await waitFor(() => expect(result.current).toBe(true));
    expect(refA.release).toHaveBeenCalled();
    expect(refB.release).toHaveBeenCalled();
  });

  it('stays undecided when a load fails, releasing the ref that did load', async () => {
    const loadedRef = makeRef(800, 600);
    loadSpy
      .mockResolvedValueOnce(loadedRef)
      .mockRejectedValueOnce(new Error('not found'));

    const { result } = renderHook(() => useImagePairAspectMatch(pair));

    await act(async () => {});
    expect(result.current).toBeUndefined();
    expect(loadedRef.release).toHaveBeenCalled();
  });

  it('resets the verdict during render when the sources change', async () => {
    loadSpy
      .mockResolvedValueOnce(makeRef(800, 600))
      .mockResolvedValueOnce(makeRef(400, 300));

    const { result, rerender } = renderHook(
      (sources: typeof pair) => useImagePairAspectMatch(sources),
      { initialProps: pair },
    );

    await waitFor(() => expect(result.current).toBe(true));

    // Gate the new pair's measurements so the reset is observable before the
    // new verdict lands.
    let openGate!: () => void;
    const gate = new Promise<void>(resolve => {
      openGate = resolve;
    });
    const gatedRefs = [makeRef(1600, 900), makeRef(800, 600)];
    loadSpy.mockImplementation(() => gate.then(() => gatedRefs.shift()));

    rerender([
      { uri: 'https://example.com/c.png', headers: {} },
      { uri: 'https://example.com/d.png', headers: {} },
    ]);

    expect(result.current).toBeUndefined();

    await act(async () => openGate());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('stays undecided without measuring when the array is not a pair', async () => {
    const single = [pair[0]];

    const { result } = renderHook(() => useImagePairAspectMatch(single));

    await act(async () => {});
    expect(result.current).toBeUndefined();
    expect(loadSpy).not.toHaveBeenCalled();
  });
});
