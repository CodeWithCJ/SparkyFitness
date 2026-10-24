import { Switch } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { type GeneratedRoutePreview } from '@workspace/shared';
import RouteDrawScreen from '../../src/screens/RouteDrawScreen';
import {
  generateRoutePreview,
  saveDrawnRoute,
  useRouteGenerationCapabilities,
} from '../../src/services/routeService';
import { useScreenHeader } from '../../src/hooks/useScreenHeader';
import { FOLLOW_ROADS_DEBOUNCE_MS } from '../../src/hooks/useFollowRoadsRoute';
import { ApiError } from '../../src/services/api/errors';
import { routeRequestBudget } from '../../src/utils/routeRequestBudget';

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: false })),
  getLastKnownPositionAsync: jest.fn(),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/services/routeService', () => ({
  generateRoutePreview: jest.fn(),
  saveDrawnRoute: jest.fn(),
  saveRouteEdits: jest.fn(),
  useRoute: () => ({ route: undefined }),
  useRouteGenerationCapabilities: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const mockCapabilities = useRouteGenerationCapabilities as jest.Mock;
const caps = (available: boolean, isLoading = false) => ({
  capabilities: {
    available,
    maxAlternatives: 1,
    style: {
      surface: false,
      hilliness: false,
      avoidSteps: false,
      avoidBusyRoads: false,
    },
    stops: false,
    source: null,
  },
  isLoading,
});
const mockGenerate = generateRoutePreview as jest.Mock;
const mockSave = saveDrawnRoute as jest.Mock;
const mockHeader = useScreenHeader as jest.Mock;

const snapped: GeneratedRoutePreview = {
  name: 'Generated',
  activity: 'run',
  source: 'generated',
  points: [
    { lat: 40, lon: -100 },
    { lat: 40.002, lon: -100.001 },
    { lat: 40.004, lon: -100 },
  ],
  cues: [
    { index: 0, kind: 'depart' },
    { index: 1, kind: 'left', distanceM: 200 },
    { index: 2, kind: 'right', distanceM: 400 },
  ],
  distanceM: 650,
  elevationGainM: null,
};

const navigation = { replace: jest.fn() };

function renderScreen() {
  const utils = render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }}
    >
      <RouteDrawScreen
        navigation={navigation as never}
        route={{ key: 'k', name: 'RouteDraw' } as never}
      />
    </SafeAreaProvider>
  );
  // Zoomed in, so a tap only lands on the line when it is close to it.
  act(() =>
    utils.getByTestId('map-view').props.onRegionChangeComplete({
      latitude: 40,
      longitude: -100,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    })
  );
  return utils;
}

const tapMap = (
  utils: ReturnType<typeof renderScreen>,
  latitude: number,
  longitude = -100
) =>
  act(() =>
    utils.getByTestId('map-view').props.onPress({
      nativeEvent: { coordinate: { latitude, longitude } },
    })
  );
const settle = async (ms = FOLLOW_ROADS_DEBOUNCE_MS) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await act(async () => undefined);
};
const lastHeader = () => mockHeader.mock.calls.at(-1)?.[0];

describe('RouteDrawScreen follow roads', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    routeRequestBudget.reset();
    mockCapabilities.mockReturnValue(caps(true, false));
  });
  afterEach(() => jest.useRealTimers());

  it('shows a disabled Follow roads row that says a routing provider is needed', () => {
    mockCapabilities.mockReturnValue(caps(false, false));
    const utils = renderScreen();
    expect(utils.getByText('Follow roads')).toBeTruthy();
    expect(
      utils.getByText(
        'A routing provider is needed. Add one in Settings > External Providers on the web app.'
      )
    ).toBeTruthy();
    const toggles = utils.UNSAFE_getAllByType(Switch);
    expect(toggles).toHaveLength(1);
    expect(toggles[0].props.disabled).toBe(true);
    expect(toggles[0].props.value).toBe(false);
  });

  it('does not flash the disabled row while capabilities are loading', () => {
    mockCapabilities.mockReturnValue(caps(false, true));
    const utils = renderScreen();
    expect(utils.queryByText('Follow roads')).toBeNull();
  });

  it('shows the working switch, not the notice, with a routing provider', () => {
    const utils = renderScreen();
    expect(utils.queryByText(/routing provider is needed/i)).toBeNull();
    expect(utils.UNSAFE_getAllByType(Switch)[0].props.disabled).toBeFalsy();
  });

  it('keeps working as before without a routing engine', () => {
    mockCapabilities.mockReturnValue(caps(false, false));
    const utils = renderScreen();
    tapMap(utils, 40);
    tapMap(utils, 40.01);
    expect(utils.getAllByTestId('map-polyline')).toHaveLength(1);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('keeps straight lines with the toggle off', async () => {
    const utils = renderScreen();
    expect(utils.getByText('Follow roads')).toBeTruthy();
    tapMap(utils, 40);
    tapMap(utils, 40.01);
    await settle(FOLLOW_ROADS_DEBOUNCE_MS * 2);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(utils.getByTestId('map-polyline').props.coordinates).toHaveLength(2);
  });

  it('sends the taps as ordered waypoints and draws the engine line', async () => {
    mockGenerate.mockResolvedValue(snapped);
    const utils = renderScreen();
    fireEvent(utils.getByLabelText('Follow roads'), 'valueChange', true);
    tapMap(utils, 40);
    tapMap(utils, 40.002, -100.001);
    tapMap(utils, 40.004);
    expect(mockGenerate).not.toHaveBeenCalled();

    await settle();
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate.mock.calls[0][0]).toMatchObject({
      mode: 'waypoints',
      start: { lat: 40, lon: -100 },
      waypoints: [
        { lat: 40.002, lon: -100.001 },
        { lat: 40.004, lon: -100 },
      ],
    });
    // One polyline per stretch; they share the point where they meet.
    expect(
      utils
        .getAllByTestId('map-polyline')
        .flatMap((line) => line.props.coordinates)
    ).toHaveLength(snapped.points.length + 1);
    // The distance is measured along the drawn line.
    expect(utils.getByText(/4\d\d m|0\.4\d km/)).toBeTruthy();
    expect(utils.getByText(/2 turns/)).toBeTruthy();
  });

  it('draws a piece that failed straight, keeps the points, and offers a retry', async () => {
    mockGenerate.mockResolvedValueOnce(snapped);
    const utils = renderScreen();
    fireEvent(utils.getByLabelText('Follow roads'), 'valueChange', true);
    tapMap(utils, 40);
    tapMap(utils, 40.004);
    await settle();
    expect(mockGenerate).toHaveBeenCalledTimes(1);

    // The third point joins the first piece, which is asked for again and fails.
    mockGenerate.mockRejectedValueOnce(new ApiError('x', 422, '{}'));
    tapMap(utils, 40.01);
    await settle();
    expect(utils.getByText(/No route found there/)).toBeTruthy();
    expect(utils.getByText(/show straight/)).toBeTruthy();
    expect(utils.getByText('Retry')).toBeTruthy();
    expect(utils.getAllByTestId('map-marker')).toHaveLength(3);
    // The shown line does not match the points, so it cannot be saved.
    expect(lastHeader().right.disabled).toBe(true);
  });

  it('routes a long route in pieces and only re-routes the piece a change touches', async () => {
    mockGenerate.mockResolvedValue(snapped);
    const utils = renderScreen();
    fireEvent(utils.getByLabelText('Follow roads'), 'valueChange', true);
    for (let i = 0; i < 25; i++) tapMap(utils, 40 + i * 0.001);
    await settle();
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(mockGenerate.mock.calls[0][0].waypoints).toHaveLength(20);
    expect(mockGenerate.mock.calls[1][0].waypoints).toHaveLength(4);

    // Moving the last point only changes the second piece.
    const markers = utils.getAllByTestId('map-marker');
    act(() =>
      markers[24].props.onDragEnd({
        nativeEvent: { coordinate: { latitude: 40.03, longitude: -100 } },
      })
    );
    await settle();
    expect(mockGenerate).toHaveBeenCalledTimes(3);
    expect(mockGenerate.mock.calls[2][0].waypoints).toHaveLength(4);

    // Undo goes back to a piece already routed, so nothing is asked again.
    fireEvent.press(utils.getByText('Undo'));
    await settle();
    expect(mockGenerate).toHaveBeenCalledTimes(3);
  });

  it('stays within the rate limit over a long edit session and keeps every point', async () => {
    mockGenerate.mockResolvedValue(snapped);
    const utils = renderScreen();
    fireEvent(utils.getByLabelText('Follow roads'), 'valueChange', true);
    // A 40-point snapped route: two pieces.
    for (let i = 0; i < 40; i++) tapMap(utils, 40 + i * 0.001);
    await settle();
    expect(mockGenerate).toHaveBeenCalledTimes(2);

    // A dozen separate edits, spaced out, each moving a different point.
    for (let n = 0; n < 12; n++) {
      const markers = utils.getAllByTestId('map-marker');
      act(() =>
        markers[3 + n * 3].props.onDragEnd({
          nativeEvent: {
            coordinate: {
              latitude: 40.0005 + (3 + n * 3) * 0.001,
              longitude: -100.0003,
            },
          },
        })
      );
      await settle(5000);
    }
    // The server allows 10 per 10 minutes; the editor stops short of that.
    expect(mockGenerate.mock.calls.length).toBeLessThanOrEqual(8);
    expect(utils.getAllByTestId('map-marker')).toHaveLength(40);
    expect(utils.getByText(/Too many route requests/)).toBeTruthy();
    expect(lastHeader().right.disabled).toBe(true);

    // When the window frees up it routes the latest state by itself.
    const before = mockGenerate.mock.calls.length;
    await settle(10 * 60 * 1000);
    await settle();
    expect(mockGenerate.mock.calls.length).toBeGreaterThan(before);
    expect(mockGenerate.mock.calls.length - before).toBeLessThanOrEqual(2);
  });

  it('saves the snapped line with its cues once it matches the taps', async () => {
    mockGenerate.mockResolvedValue(snapped);
    mockSave.mockResolvedValue({ id: 'route-1' });
    const utils = renderScreen();
    fireEvent(utils.getByLabelText('Follow roads'), 'valueChange', true);
    fireEvent.changeText(utils.getByLabelText('Route name'), 'Park loop');
    tapMap(utils, 40);
    tapMap(utils, 40.004);
    expect(lastHeader().right.disabled).toBe(true);
    await settle();
    expect(lastHeader().right.disabled).toBe(false);

    await act(async () => lastHeader().right.onPress());
    expect(mockSave).toHaveBeenCalledWith({
      name: 'Park loop',
      points: snapped.points,
      cues: snapped.cues.map((cue) => ({
        ...cue,
        distanceM: expect.any(Number),
      })),
    });
    expect(navigation.replace).toHaveBeenCalledWith('RouteDetail', {
      id: 'route-1',
    });
  });

  it('returns to straight lines when switched off', async () => {
    mockGenerate.mockResolvedValue(snapped);
    const utils = renderScreen();
    fireEvent(utils.getByLabelText('Follow roads'), 'valueChange', true);
    tapMap(utils, 40);
    tapMap(utils, 40.004);
    await settle();
    fireEvent(utils.getByLabelText('Follow roads'), 'valueChange', false);
    expect(utils.getByTestId('map-polyline').props.coordinates).toHaveLength(2);
  });
});
