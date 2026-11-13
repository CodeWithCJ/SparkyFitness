import { act, renderHook } from '@testing-library/react-native';
import type { GeneratedRoutePreview, RoutePoint } from '@workspace/shared';
import {
  FOLLOW_ROADS_DEBOUNCE_MS,
  useFollowRoadsRoute,
} from '../../src/hooks/useFollowRoadsRoute';
import { generateRoutePreview } from '../../src/services/routeService';
import { routeRequestBudget } from '../../src/utils/routeRequestBudget';
import { ApiError } from '../../src/services/api/errors';
import {
  addPoint,
  setLegStraight,
  EMPTY_EDITOR_STATE,
  type EditorState,
} from '../../src/utils/routeEditor';

jest.mock('../../src/services/routeService', () => ({
  generateRoutePreview: jest.fn(),
}));

const mockGenerate = generateRoutePreview as jest.MockedFunction<
  typeof generateRoutePreview
>;

const pt = (i: number): RoutePoint => ({ lat: 40 + i * 0.001, lon: -100 });
const stateOf = (...indexes: number[]): EditorState =>
  indexes.reduce(
    (state, i) => addPoint(state, pt(i)),
    EMPTY_EDITOR_STATE as EditorState
  );
/** A routed answer from `from` to `to` with a bend in the middle. */
const routed = (from: number, to: number): GeneratedRoutePreview => ({
  name: 'Generated',
  activity: 'run',
  source: 'generated',
  points: [pt(from), { lat: pt(from).lat, lon: -100.001 }, pt(to)],
  cues: [{ index: 0, kind: 'depart' }],
  distanceM: 1000,
  elevationGainM: null,
});

const flush = () => act(async () => undefined);
const advance = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

describe('useFollowRoadsRoute', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGenerate.mockReset();
    routeRequestBudget.reset();
  });
  afterEach(() => jest.useRealTimers());

  it('does nothing when off or with fewer than two points', async () => {
    const { result, rerender } = renderHook(
      ({ enabled, state }: { enabled: boolean; state: EditorState }) =>
        useFollowRoadsRoute(enabled, state),
      { initialProps: { enabled: false, state: stateOf(0, 1) } }
    );
    await advance(FOLLOW_ROADS_DEBOUNCE_MS * 2);
    expect(mockGenerate).not.toHaveBeenCalled();
    // Off draws the straight line and is always current.
    expect(result.current.line.points).toEqual([pt(0), pt(1)]);
    expect(result.current.isCurrent).toBe(true);
    rerender({ enabled: true, state: stateOf(0) });
    await advance(FOLLOW_ROADS_DEBOUNCE_MS * 2);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it('debounces bursts of edits into one waypoints request', async () => {
    mockGenerate.mockResolvedValue(routed(0, 3));
    const { result, rerender } = renderHook(
      ({ state }: { state: EditorState }) => useFollowRoadsRoute(true, state),
      { initialProps: { state: stateOf(0, 1) } }
    );
    await advance(FOLLOW_ROADS_DEBOUNCE_MS - 100);
    rerender({ state: stateOf(0, 1, 2) });
    await advance(FOLLOW_ROADS_DEBOUNCE_MS - 100);
    rerender({ state: stateOf(0, 1, 2, 3) });
    expect(result.current.isLoading).toBe(true);
    expect(mockGenerate).not.toHaveBeenCalled();

    await advance(FOLLOW_ROADS_DEBOUNCE_MS);
    await flush();
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate.mock.calls[0][0]).toMatchObject({
      mode: 'waypoints',
      start: pt(0),
      waypoints: [pt(1), pt(2), pt(3)],
    });
    expect(result.current.line.points).toHaveLength(3);
    expect(result.current.isCurrent).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('routes around a straight stretch as two pieces and leaves the stretch alone', async () => {
    mockGenerate.mockImplementation(async (body) =>
      body.mode === 'waypoints' && body.start.lat === pt(0).lat
        ? routed(0, 1)
        : routed(2, 3)
    );
    const state = setLegStraight(stateOf(0, 1, 2, 3), 1, true);
    const { result } = renderHook(() => useFollowRoadsRoute(true, state));
    await advance(FOLLOW_ROADS_DEBOUNCE_MS);
    await flush();
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    const { points, waypointIndexes } = result.current.line;
    // routed 0-1 (3 points), straight to 2 (1 more), routed 2-3 (2 more).
    expect(points).toHaveLength(6);
    expect(waypointIndexes).toEqual([0, 2, 3, 5]);
    expect(result.current.isCurrent).toBe(true);
  });

  it('shows a failed piece straight and says why', async () => {
    mockGenerate.mockRejectedValueOnce(new ApiError('nope', 422, '{}'));
    const { result } = renderHook(() =>
      useFollowRoadsRoute(true, stateOf(0, 1, 2))
    );
    await advance(FOLLOW_ROADS_DEBOUNCE_MS);
    await flush();
    expect(result.current.line.points).toEqual([pt(0), pt(1), pt(2)]);
    expect(result.current.isCurrent).toBe(false);
    expect(result.current.errorKind).toBe('noRoute');
    expect(result.current.isLoading).toBe(false);
  });

  it('does not ask again for a piece it already has', async () => {
    mockGenerate.mockResolvedValue(routed(0, 1));
    const { rerender } = renderHook(
      ({ state }: { state: EditorState }) => useFollowRoadsRoute(true, state),
      { initialProps: { state: stateOf(0, 1) } }
    );
    await advance(FOLLOW_ROADS_DEBOUNCE_MS);
    await flush();
    mockGenerate.mockResolvedValue(routed(0, 2));
    rerender({ state: stateOf(0, 1, 2) });
    await advance(FOLLOW_ROADS_DEBOUNCE_MS);
    await flush();
    rerender({ state: stateOf(0, 1) });
    await advance(FOLLOW_ROADS_DEBOUNCE_MS * 2);
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });

  it('pauses after a rate limit until retry', async () => {
    mockGenerate.mockRejectedValueOnce(new ApiError('slow down', 429, '{}'));
    const { result, rerender } = renderHook(
      ({ state }: { state: EditorState }) => useFollowRoadsRoute(true, state),
      { initialProps: { state: stateOf(0, 1) } }
    );
    await advance(FOLLOW_ROADS_DEBOUNCE_MS);
    await flush();
    expect(result.current.errorKind).toBe('rateLimited');

    rerender({ state: stateOf(0, 1, 2) });
    await advance(FOLLOW_ROADS_DEBOUNCE_MS * 2);
    expect(mockGenerate).toHaveBeenCalledTimes(1);

    mockGenerate.mockResolvedValueOnce(routed(0, 2));
    act(() => result.current.retry());
    await advance(FOLLOW_ROADS_DEBOUNCE_MS);
    await flush();
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(result.current.isCurrent).toBe(true);
    expect(result.current.error).toBeNull();
  });
});
