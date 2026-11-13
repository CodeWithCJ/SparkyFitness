import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import type {
  GeneratedRouteOption,
  GeneratedRoutePreview,
  RouteGenerateCapabilities,
} from '@workspace/shared';
import RouteGenerateScreen from '../../src/screens/RouteGenerateScreen';
import {
  generateRouteOptions,
  saveGeneratedRoute,
  useRouteGenerationCapabilities,
} from '../../src/services/routeService';
import { useScreenHeader } from '../../src/hooks/useScreenHeader';
import { ApiError } from '../../src/services/api/errors';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/services/routeService', () => ({
  generateRouteOptions: jest.fn(),
  saveGeneratedRoute: jest.fn(),
  useRouteGenerationCapabilities: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const mockCapabilities = useRouteGenerationCapabilities as jest.Mock;
const mockGenerate = generateRouteOptions as jest.Mock;
const mockSave = saveGeneratedRoute as jest.Mock;
const mockHeader = useScreenHeader as jest.Mock;
const mockPermission = Location.requestForegroundPermissionsAsync as jest.Mock;
const mockPosition = Location.getCurrentPositionAsync as jest.Mock;

const preview: GeneratedRoutePreview = {
  name: 'Generated 5.0 km run',
  activity: 'run',
  source: 'generated',
  points: [
    { lat: 40, lon: -100 },
    { lat: 40.01, lon: -100 },
    { lat: 40, lon: -100 },
  ],
  cues: [
    { index: 0, kind: 'depart' },
    { index: 1, kind: 'left', distanceM: 1000 },
    { index: 2, kind: 'arrive', distanceM: 5000 },
  ],
  distanceM: 5000,
  elevationGainM: 42,
};

const NO_STYLE = {
  surface: false,
  hilliness: false,
  avoidSteps: false,
  avoidBusyRoads: false,
};

const capabilities = (
  overrides: Partial<RouteGenerateCapabilities> = {},
  isLoading = false
) => ({
  capabilities: {
    available: true,
    maxAlternatives: 1,
    style: NO_STYLE,
    stops: false,
    ...overrides,
  },
  isLoading,
});

const option = (
  route: GeneratedRoutePreview = preview,
  label: GeneratedRouteOption['label'] = null
): GeneratedRouteOption => ({ route, label, trailShare: null });

const answer = (...options: GeneratedRouteOption[]) => ({
  route: (options[0] as GeneratedRouteOption).route,
  options,
});

const navigation = { replace: jest.fn(), goBack: jest.fn() };

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }}
    >
      <RouteGenerateScreen
        navigation={navigation as never}
        route={{ key: 'k', name: 'RouteGenerate' } as never}
      />
    </SafeAreaProvider>
  );
}

const lastHeader = () => mockHeader.mock.calls.at(-1)?.[0];

describe('RouteGenerateScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCapabilities.mockReturnValue(capabilities());
    mockPermission.mockResolvedValue({ granted: true });
    mockPosition.mockResolvedValue({
      coords: { latitude: 40, longitude: -100 },
    });
  });

  it('explains when the server has no routing engine', () => {
    mockCapabilities.mockReturnValue(capabilities({ available: false }));
    const { getByText, queryByTestId } = renderScreen();
    expect(getByText(/needs a routing provider/i)).toBeTruthy();
    expect(queryByTestId('map-view')).toBeNull();
    expect(mockPermission).not.toHaveBeenCalled();
  });

  it('shows neither the map nor the notice while checking', () => {
    mockCapabilities.mockReturnValue(capabilities({ available: false }, true));
    const { queryByText, queryByTestId } = renderScreen();
    expect(queryByText(/needs a routing provider/i)).toBeNull();
    expect(queryByTestId('map-view')).toBeNull();
  });

  it('shows a spinner while generating, then the preview numbers', async () => {
    let resolve: (value: ReturnType<typeof answer>) => void = () => undefined;
    mockGenerate.mockReturnValue(new Promise((r) => (resolve = r)));
    const { getByText, queryByText, getAllByTestId } = renderScreen();
    await waitFor(() => expect(mockPosition).toHaveBeenCalled());
    await waitFor(() =>
      expect(getByText(/Starting at the green pin/)).toBeTruthy()
    );

    fireEvent.press(getByText('Generate'));
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate.mock.calls[0][0]).toMatchObject({
      mode: 'loop',
      shape: 'loop',
      activity: 'run',
      distanceM: 5000,
      start: { lat: 40, lon: -100 },
    });
    expect(queryByText(/climb/)).toBeNull();

    await act(async () => resolve(answer(option())));
    expect(getByText(/5\.00 km/)).toBeTruthy();
    expect(getByText(/42 m climb/)).toBeTruthy();
    expect(getByText(/1 turn\b/)).toBeTruthy();
    expect(getAllByTestId('map-polyline')).toHaveLength(1);
    expect(getByText('Try another direction')).toBeTruthy();
  });

  it('turns an engine error into a short message', async () => {
    mockGenerate.mockRejectedValue(new ApiError('Server error', 422, '{}'));
    const { getByText } = renderScreen();
    await waitFor(() =>
      expect(getByText(/Starting at the green pin/)).toBeTruthy()
    );
    fireEvent.press(getByText('Generate'));
    await waitFor(() => expect(getByText(/No route found there/)).toBeTruthy());
  });

  it('rate limit message is shown for a 429', async () => {
    mockGenerate.mockRejectedValue(new ApiError('Server error', 429, '{}'));
    const { getByText } = renderScreen();
    await waitFor(() =>
      expect(getByText(/Starting at the green pin/)).toBeTruthy()
    );
    fireEvent.press(getByText('Generate'));
    await waitFor(() =>
      expect(getByText(/Too many route requests/)).toBeTruthy()
    );
  });

  it('regenerates toward a different heading and keeps the preview if it fails', async () => {
    mockGenerate.mockResolvedValueOnce(answer(option()));
    const { getByText, getAllByTestId } = renderScreen();
    await waitFor(() =>
      expect(getByText(/Starting at the green pin/)).toBeTruthy()
    );
    fireEvent.press(getByText('Generate'));
    await waitFor(() =>
      expect(getByText('Try another direction')).toBeTruthy()
    );
    const firstBearing = mockGenerate.mock.calls[0][0].bearingDeg;

    mockGenerate.mockRejectedValueOnce(new ApiError('Server error', 502, '{}'));
    fireEvent.press(getByText('Try another direction'));
    await waitFor(() =>
      expect(getByText(/routing service had a problem/)).toBeTruthy()
    );
    const secondBearing = mockGenerate.mock.calls[1][0].bearingDeg;
    const turn = (((secondBearing - firstBearing) % 360) + 360) % 360;
    expect(turn).toBeGreaterThanOrEqual(90);
    expect(turn).toBeLessThanOrEqual(270);
    expect(getAllByTestId('map-polyline')).toHaveLength(1);
    expect(getByText(/5\.00 km/)).toBeTruthy();
  });

  it('does not call the server for a distance it would reject', async () => {
    const { getByText, getByLabelText } = renderScreen();
    await waitFor(() =>
      expect(getByText(/Starting at the green pin/)).toBeTruthy()
    );
    fireEvent.changeText(getByLabelText('Distance'), '900');
    expect(getByText(/Choose between/)).toBeTruthy();
    fireEvent.press(getByText('Generate'));
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('saves the preview from the header and opens it', async () => {
    mockGenerate.mockResolvedValue(answer(option()));
    mockSave.mockResolvedValue({ id: 'route-1' });
    const { getByText } = renderScreen();
    await waitFor(() =>
      expect(getByText(/Starting at the green pin/)).toBeTruthy()
    );
    expect(lastHeader().right.disabled).toBe(true);
    fireEvent.press(getByText('Generate'));
    await waitFor(() => expect(lastHeader().right.disabled).toBe(false));

    await act(async () => lastHeader().right.onPress());
    expect(mockSave).toHaveBeenCalledWith(preview, 'Generated 5.0 km run');
    expect(navigation.replace).toHaveBeenCalledWith('RouteDetail', {
      id: 'route-1',
    });
  });
  describe('options', () => {
    const second: GeneratedRoutePreview = {
      ...preview,
      name: 'Generated 6.2 km run',
      distanceM: 6200,
      elevationGainM: 12,
      points: [
        { lat: 40, lon: -100 },
        { lat: 40, lon: -100.02 },
        { lat: 40.02, lon: -100.02 },
        { lat: 40, lon: -100 },
      ],
    };

    beforeEach(() => {
      mockCapabilities.mockReturnValue(capabilities({ maxAlternatives: 3 }));
    });

    const generateTwo = async () => {
      mockGenerate.mockResolvedValue(
        answer(option(preview), option(second, 'flatter'))
      );
      const screen = renderScreen();
      await waitFor(() =>
        expect(screen.getByText(/Starting at the green pin/)).toBeTruthy()
      );
      fireEvent.press(screen.getByText('Generate'));
      await waitFor(() =>
        expect(screen.getByTestId('route-option-cards')).toBeTruthy()
      );
      return screen;
    };

    it('asks for as many options as the server supports', async () => {
      await generateTwo();
      expect(mockGenerate.mock.calls[0][0].alternatives).toBe(3);
    });

    it('shows each option as a card with its numbers and honest label', async () => {
      const { getByTestId, getByLabelText } = await generateTwo();
      expect(getByTestId('route-option-0')).toBeTruthy();
      expect(
        getByLabelText('Option 2, Flatter, 6.20 km, 12 m climb')
      ).toBeTruthy();
      expect(getByLabelText('Option 1, 5.00 km, 42 m climb')).toBeTruthy();
    });

    it('puts the chosen option on the map and saves that one', async () => {
      mockSave.mockResolvedValue({ id: 'route-2' });
      const { getByTestId, getAllByText, getByDisplayValue, getAllByTestId } =
        await generateTwo();
      expect(getByDisplayValue('Generated 5.0 km run')).toBeTruthy();

      fireEvent.press(getByTestId('route-option-1'));
      expect(getByDisplayValue('Generated 6.2 km run')).toBeTruthy();
      expect(getAllByText(/6\.20 km/).length).toBeGreaterThan(0);
      expect(getAllByTestId('map-polyline')).toHaveLength(1);
      expect(getAllByTestId('map-polyline')[0].props.coordinates).toHaveLength(
        4
      );

      await act(async () => lastHeader().right.onPress());
      expect(mockSave).toHaveBeenCalledWith(second, 'Generated 6.2 km run');
      expect(navigation.replace).toHaveBeenCalledWith('RouteDetail', {
        id: 'route-2',
      });
    });

    it('shows no cards for a single option', async () => {
      mockGenerate.mockResolvedValue(answer(option()));
      const { getByText, queryByTestId } = renderScreen();
      await waitFor(() =>
        expect(getByText(/Starting at the green pin/)).toBeTruthy()
      );
      fireEvent.press(getByText('Generate'));
      await waitFor(() =>
        expect(getByText('Try another direction')).toBeTruthy()
      );
      expect(queryByTestId('route-option-cards')).toBeNull();
    });
  });

  describe('route style', () => {
    it('is hidden when the engine supports none of it', () => {
      const { queryByText } = renderScreen();
      expect(queryByText('Route style')).toBeNull();
    });

    it('shows only the controls the engine supports', () => {
      mockCapabilities.mockReturnValue(
        capabilities({
          style: { ...NO_STYLE, surface: true, avoidSteps: true },
        })
      );
      const { getByText, queryByText } = renderScreen();
      expect(getByText('Route style')).toBeTruthy();
      expect(getByText('Trails')).toBeTruthy();
      expect(getByText('Avoid steps')).toBeTruthy();
      expect(queryByText('Hills')).toBeNull();
      expect(queryByText('Avoid busy roads')).toBeNull();
    });

    it('hides avoid steps for a ride', () => {
      mockCapabilities.mockReturnValue(
        capabilities({
          style: { ...NO_STYLE, avoidSteps: true, avoidBusyRoads: true },
        })
      );
      const { getByText, queryByText } = renderScreen();
      expect(getByText('Avoid steps')).toBeTruthy();
      fireEvent.press(getByText('Ride'));
      expect(queryByText('Avoid steps')).toBeNull();
      expect(getByText('Avoid busy roads')).toBeTruthy();
    });

    it('sends the chosen preferences, and nothing when none were chosen', async () => {
      mockCapabilities.mockReturnValue(
        capabilities({
          style: {
            surface: true,
            hilliness: true,
            avoidSteps: true,
            avoidBusyRoads: true,
          },
        })
      );
      mockGenerate.mockResolvedValue(answer(option()));
      const { getByText } = renderScreen();
      await waitFor(() =>
        expect(getByText(/Starting at the green pin/)).toBeTruthy()
      );
      fireEvent.press(getByText('Generate'));
      await waitFor(() =>
        expect(getByText('Try another direction')).toBeTruthy()
      );
      expect(mockGenerate.mock.calls[0][0].style).toBeUndefined();

      fireEvent.press(getByText('Trails'));
      fireEvent.press(getByText('Flatter'));
      fireEvent.press(getByText('Avoid steps'));
      fireEvent.press(getByText('Try another direction'));
      await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(2));
      expect(mockGenerate.mock.calls[1][0].style).toEqual({
        surface: 'trails',
        hilliness: 'flat',
        avoidSteps: true,
        avoidBusyRoads: false,
      });
    });
  });
});
