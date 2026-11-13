import { act, fireEvent, render } from '@testing-library/react-native';
import type { Route } from '@workspace/shared';
import RouteDrawScreen from '../../src/screens/RouteDrawScreen';
import {
  saveRouteEdits,
  useRoute,
  useRouteGenerationCapabilities,
} from '../../src/services/routeService';
import { routeRequestBudget } from '../../src/utils/routeRequestBudget';
import { useScreenHeader } from '../../src/hooks/useScreenHeader';

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
  useRoute: jest.fn(),
  useRouteGenerationCapabilities: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const capabilities = (available: boolean, isLoading = false) => ({
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

const navigation = { replace: jest.fn(), goBack: jest.fn() };

function renderScreen(routeId?: string) {
  const utils = render(
    <RouteDrawScreen
      navigation={navigation as never}
      route={
        {
          key: 'k',
          name: 'RouteDraw',
          params: routeId ? { routeId } : undefined,
        } as never
      }
    />
  );
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
const lastHeader = () => (useScreenHeader as jest.Mock).mock.calls.at(-1)?.[0];

beforeEach(() => {
  jest.clearAllMocks();
  routeRequestBudget.reset();
  (useRouteGenerationCapabilities as jest.Mock).mockReturnValue(
    capabilities(false)
  );
  (useRoute as jest.Mock).mockReturnValue({ route: undefined });
});

describe('RouteDrawScreen editor', () => {
  it('switches between the map and satellite imagery', () => {
    const utils = renderScreen();
    expect(utils.getByTestId('map-view').props.mapType).toBe('standard');
    fireEvent.press(utils.getByText('Satellite'));
    expect(utils.getByTestId('map-view').props.mapType).toBe('hybrid');
    fireEvent.press(utils.getByText('Map'));
    expect(utils.getByTestId('map-view').props.mapType).toBe('standard');
  });

  it('moves a point when its marker is dragged', () => {
    const utils = renderScreen();
    tapMap(utils, 40);
    tapMap(utils, 40.01);
    act(() =>
      utils.getAllByTestId('map-marker')[1].props.onDragEnd({
        nativeEvent: { coordinate: { latitude: 40.02, longitude: -100 } },
      })
    );
    expect(utils.getAllByTestId('map-marker')[1].props.coordinate).toEqual({
      latitude: 40.02,
      longitude: -100,
    });
  });

  it('inserts a point when the line is tapped and appends when it is not', () => {
    const utils = renderScreen();
    tapMap(utils, 40);
    tapMap(utils, 40.01);
    tapMap(utils, 40.005, -100.00001);
    const markers = utils.getAllByTestId('map-marker');
    expect(markers).toHaveLength(3);
    expect(markers[1].props.coordinate.latitude).toBeCloseTo(40.005, 4);
    tapMap(utils, 40.05);
    expect(utils.getAllByTestId('map-marker')).toHaveLength(4);
    expect(
      utils.getAllByTestId('map-marker')[3].props.coordinate.latitude
    ).toBeCloseTo(40.05);
  });

  it('deletes the selected point', () => {
    const utils = renderScreen();
    tapMap(utils, 40);
    tapMap(utils, 40.01);
    tapMap(utils, 40.02);
    act(() =>
      utils.getAllByTestId('map-marker')[1].props.onPress({
        stopPropagation: jest.fn(),
      })
    );
    fireEvent.press(utils.getByText('Delete point'));
    expect(utils.getAllByTestId('map-marker')).toHaveLength(2);
    expect(utils.queryByText('Delete point')).toBeNull();
  });

  it('undoes, redoes and clears', () => {
    const utils = renderScreen();
    tapMap(utils, 40);
    tapMap(utils, 40.01);
    fireEvent.press(utils.getByText('Undo'));
    expect(utils.getAllByTestId('map-marker')).toHaveLength(1);
    fireEvent.press(utils.getByText('Redo'));
    expect(utils.getAllByTestId('map-marker')).toHaveLength(2);
    fireEvent.press(utils.getByText('Clear'));
    expect(utils.queryAllByTestId('map-marker')).toHaveLength(0);
    fireEvent.press(utils.getByText('Undo'));
    expect(utils.getAllByTestId('map-marker')).toHaveLength(2);
  });

  it('offers straight/follow-roads choices per stretch only when roads are followed', () => {
    (useRouteGenerationCapabilities as jest.Mock).mockReturnValue(
      capabilities(true)
    );
    const utils = renderScreen();
    tapMap(utils, 40);
    tapMap(utils, 40.01);
    act(() =>
      utils.getAllByTestId('map-marker')[1].props.onPress({
        stopPropagation: jest.fn(),
      })
    );
    expect(utils.queryByText('Straight before')).toBeNull();
    fireEvent(utils.getByLabelText('Follow roads'), 'valueChange', true);
    fireEvent.press(utils.getByText('Straight before'));
    expect(utils.getByText('Follow roads before')).toBeTruthy();
    expect(utils.getByTestId('map-polyline').props.lineDashPattern).toEqual([
      10, 8,
    ]);
  });

  describe('editing a saved route', () => {
    const saved: Route = {
      id: 'r1',
      name: 'Loop',
      activity: 'run',
      source: 'drawn',
      distanceM: 100,
      elevationGainM: null,
      points: [
        { lat: 40, lon: -100 },
        { lat: 40.01, lon: -100 },
      ],
      cues: [],
      sourceExerciseEntryId: null,
      createdAt: '',
      updatedAt: '',
    };

    it('opens the route and saves over it', async () => {
      (useRoute as jest.Mock).mockReturnValue({ route: saved });
      (saveRouteEdits as jest.Mock).mockResolvedValue(saved);
      const utils = renderScreen('r1');
      expect(utils.getAllByTestId('map-marker')).toHaveLength(2);
      expect(utils.getByDisplayValue('Loop')).toBeTruthy();

      tapMap(utils, 40.02);
      await act(async () => lastHeader().right.onPress());
      expect(saveRouteEdits).toHaveBeenCalledWith('r1', {
        name: 'Loop',
        points: [
          { lat: 40, lon: -100 },
          { lat: 40.01, lon: -100 },
          { lat: 40.02, lon: -100 },
        ],
        cues: [],
      });
      expect(navigation.goBack).toHaveBeenCalled();
    });
  });
});
