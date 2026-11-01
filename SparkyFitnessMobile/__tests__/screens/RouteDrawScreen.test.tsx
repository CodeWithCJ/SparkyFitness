import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import RouteDrawScreen from '../../src/screens/RouteDrawScreen';
import { saveDrawnRoute } from '../../src/services/routeService';
import { ROUTE_EDITOR_MAX_POINTS } from '../../src/utils/routeEditor';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/services/routeService', () => ({
  saveDrawnRoute: jest.fn(),
  saveRouteEdits: jest.fn(),
  useRoute: () => ({ route: undefined }),
  useRouteGenerationCapabilities: () => ({
    capabilities: {
      available: false,
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
    isLoading: false,
  }),
}));
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ granted: false }),
  getLastKnownPositionAsync: jest.fn(),
}));
const mockHeader = jest.fn();
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: (options: unknown) => {
    mockHeader(options);
    return null;
  },
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('uniwind', () => ({
  useCSSVariable: () => '#2563eb',
  useUniwind: () => ({ theme: 'light' }),
}));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const replace = jest.fn();
const hidden = { includeHiddenElements: true };

const renderScreen = () => {
  const utils = render(
    <RouteDrawScreen
      {...({
        navigation: { replace },
        route: { key: 'k', name: 'RouteDraw' },
      } as unknown as RootStackScreenProps<'RouteDraw'>)}
    />
  );
  // Zoomed in, so a tap only lands on the line when it is close to it.
  act(() =>
    utils.getByTestId('map-view', hidden).props.onRegionChangeComplete({
      latitude: 40,
      longitude: -74,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    })
  );
  return utils;
};

type HeaderOptions = {
  right: { onPress: () => void; disabled: boolean; busy: boolean };
};
const header = (): HeaderOptions =>
  mockHeader.mock.calls.at(-1)?.[0] as HeaderOptions;

const tap = (
  screen: ReturnType<typeof renderScreen>,
  latitude: number,
  longitude: number
) => {
  const map = screen.getByTestId('map-view', hidden);
  act(() => {
    map.props.onPress({ nativeEvent: { coordinate: { latitude, longitude } } });
  });
};
// About 111 m apart.
const drawTwoPoints = (screen: ReturnType<typeof renderScreen>) => {
  tap(screen, 40, -74);
  tap(screen, 40.001, -74);
};

beforeAll(async () => {
  await initializeI18n('en');
});
beforeEach(() => {
  jest.clearAllMocks();
});

describe('RouteDrawScreen', () => {
  it('starts empty with a hint and nothing to undo or save', () => {
    const screen = renderScreen();
    expect(screen.getByText('Tap the map to add points')).toBeTruthy();
    expect(header().right.disabled).toBe(true);
    expect(screen.queryAllByTestId('map-marker', hidden)).toHaveLength(0);
    expect(screen.queryAllByTestId('map-polyline', hidden)).toHaveLength(0);
  });

  it('draws the line and shows the distance once there are two points', () => {
    const screen = renderScreen();
    drawTwoPoints(screen);
    expect(screen.getAllByTestId('map-polyline', hidden)).toHaveLength(1);
    expect(screen.getByText(/^0\.1\d km$|^0\.11 km$/)).toBeTruthy();
  });

  it('marks every point so each can be dragged or selected', () => {
    const screen = renderScreen();
    for (let i = 0; i < 6; i++) tap(screen, 40 + i * 0.001, -74);
    expect(screen.getAllByTestId('map-marker', hidden)).toHaveLength(6);
  });

  it('needs a name and at least 10 m before it can be saved', () => {
    const screen = renderScreen();
    tap(screen, 40, -74);
    tap(screen, 40.00001, -74);
    fireEvent.changeText(screen.getByLabelText('Route name'), 'Loop');
    expect(header().right.disabled).toBe(true);

    tap(screen, 40.001, -74);
    expect(header().right.disabled).toBe(false);

    fireEvent.changeText(screen.getByLabelText('Route name'), '   ');
    expect(header().right.disabled).toBe(true);
  });

  it('undoes the last point and clears all of them', () => {
    const screen = renderScreen();
    drawTwoPoints(screen);
    tap(screen, 40.002, -74);
    fireEvent.press(screen.getByText('Undo'));
    expect(screen.getAllByTestId('map-marker', hidden)).toHaveLength(2);
    fireEvent.press(screen.getByText('Clear'));
    expect(screen.queryAllByTestId('map-marker', hidden)).toHaveLength(0);
    expect(screen.getByText('Tap the map to add points')).toBeTruthy();
  });

  it('stops adding points at the limit and says so', () => {
    const screen = renderScreen();
    for (let i = 0; i < ROUTE_EDITOR_MAX_POINTS; i++) {
      tap(screen, 40 + i * 0.001, -74);
    }
    expect(screen.getByText(/takes up to 100 points/)).toBeTruthy();
    tap(screen, 41, -74);
    expect(screen.getAllByTestId('map-marker', hidden)).toHaveLength(
      ROUTE_EDITOR_MAX_POINTS
    );
    // Undo frees a slot again.
    fireEvent.press(screen.getByText('Undo'));
    tap(screen, 41, -74);
    expect(screen.getAllByTestId('map-marker', hidden)).toHaveLength(
      ROUTE_EDITOR_MAX_POINTS
    );
  }, 60_000);

  it('saves the trimmed name with the points and opens the route', async () => {
    (saveDrawnRoute as jest.Mock).mockResolvedValue({ id: 'new' });
    const screen = renderScreen();
    drawTwoPoints(screen);
    fireEvent.changeText(screen.getByLabelText('Route name'), '  Loop  ');
    act(() => header().right.onPress());
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('RouteDetail', { id: 'new' })
    );
    expect(saveDrawnRoute).toHaveBeenCalledWith({
      name: 'Loop',
      points: [
        { lat: 40, lon: -74 },
        { lat: 40.001, lon: -74 },
      ],
    });
  });

  it('keeps the drawing and says so when saving fails', async () => {
    (saveDrawnRoute as jest.Mock).mockRejectedValue(new Error('offline'));
    const screen = renderScreen();
    drawTwoPoints(screen);
    fireEvent.changeText(screen.getByLabelText('Route name'), 'Loop');
    act(() => header().right.onPress());
    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ text1: 'Could not save the route' })
      )
    );
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('map-marker', hidden)).toHaveLength(2);
    await waitFor(() => expect(header().right.busy).toBe(false));
  });
});
