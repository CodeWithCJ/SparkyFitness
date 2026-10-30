import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import type { ExerciseActivityQueryItem } from '@workspace/shared';

import CardioSessionScreen from '../../src/screens/CardioSessionScreen';
import { useCardioSessionDetail } from '../../src/hooks/useCardioSessionDetail';
import { shareRouteAsGpx } from '../../src/services/gpxExport';
import { saveActivityAsRoute } from '../../src/services/routeService';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/services/fitnessTestService', () => ({
  useFitnessTests: jest.fn(() => ({
    tests: [],
    latest: null,
    loaded: true,
    isLoading: false,
    refetch: jest.fn(),
  })),
}));
jest.mock('../../src/services/gpxExport', () => ({
  shareRouteAsGpx: jest.fn(() => Promise.resolve(true)),
}));
jest.mock('../../src/services/routeService', () => ({
  saveActivityAsRoute: jest.fn(),
}));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

// The program badge reads the run program query; it has its own tests.
jest.mock('../../src/components/recording/ProgramWorkoutBadge', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../../src/hooks/useCardioSessionDetail', () => ({
  useCardioSessionDetail: jest.fn(),
}));
const mockUseScreenHeader = jest.fn((_config: object) => null);
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: (config: object) => mockUseScreenHeader(config),
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
  useUniwind: () => ({ theme: 'light' }),
}));
// The shoe picker reads the shoe list and the entry; it has its own tests.
jest.mock('../../src/components/ShoePickerCard', () => ({
  __esModule: true,
  default: () => null,
}));
// The chart draws with Skia; its data handling is covered by the hook tests.
jest.mock('../../src/components/exerciseStats/HeartRateChart', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ data }: { data: unknown[] }) => (
      <View testID="heart-rate-chart" accessibilityHint={String(data.length)} />
    ),
  };
});

jest.mock('../../src/components/exerciseStats/PaceChart', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ data }: { data: unknown[] }) => (
      <View testID="pace-chart" accessibilityHint={String(data.length)} />
    ),
  };
});

const mockDetail = useCardioSessionDetail as jest.MockedFunction<
  typeof useCardioSessionDetail
>;
type Detail = ReturnType<typeof useCardioSessionDetail>;

const SESSION = {
  id: 'run-1',
  exerciseName: 'Morning Run',
  entryDate: '2026-09-26',
  distanceFormatted: 5.2,
  durationMinutes: 31,
  formattedPace: '5:58 /km',
  avgHeartRate: 148.4,
  caloriesBurned: 402,
} as ExerciseActivityQueryItem;

function detail(overrides: Partial<Detail> = {}): Detail {
  return {
    route: [
      { t: '2026-09-26T07:00:00Z', lat: 51.5, lon: -0.1 },
      { t: '2026-09-26T07:10:00Z', lat: 51.51, lon: -0.11 },
    ],
    heartRate: [
      { timestamp: 0, bpm: 130, elapsedMinutes: 0 },
      { timestamp: 60_000, bpm: 170, elapsedMinutes: 1 },
    ],
    zones: [
      { zone: 1, lowerBpm: 100, upperBpm: 120, seconds: 600, share: 0.4 },
      { zone: 2, lowerBpm: 120, upperBpm: 140, seconds: 900, share: 0.6 },
    ],
    isRouteLoading: false,
    isHeartRateLoading: false,
    isZonesLoading: false,
    isError: false,
    ...overrides,
  } as Detail;
}

const props = (session = SESSION) =>
  ({
    navigation: {},
    route: {
      key: 'CardioSession',
      name: 'CardioSession',
      params: { session, distanceUnit: 'km' },
    },
  }) as unknown as RootStackScreenProps<'CardioSession'>;

describe('CardioSessionScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('draws pace over distance for a route with enough movement', () => {
    // 4 m/s for 5 minutes, a fix every 10 s.
    const route = Array.from({ length: 31 }, (_, i) => ({
      t: new Date(Date.UTC(2026, 8, 26, 7, 0, i * 10)).toISOString(),
      lat: 51.5 + (i * 40) / 111_194.9,
      lon: -0.1,
    }));
    mockDetail.mockReturnValue(detail({ route }));
    const screen = render(<CardioSessionScreen {...props()} />);
    expect(screen.getAllByText('Pace').length).toBeGreaterThan(1);
    expect(screen.getByTestId('pace-chart')).toBeTruthy();
    expect(screen.getByText('Best 4:10 /km')).toBeTruthy();
  });

  it('leaves out the pace card when the route is too short to read a pace from', () => {
    mockDetail.mockReturnValue(detail());
    const screen = render(<CardioSessionScreen {...props()} />);
    expect(screen.queryByTestId('pace-chart')).toBeNull();
  });

  // A GymKit stair stepper in Apple Health: 17 min, 56 flights, 597 ft.
  const STAIRS = {
    id: 'stairs-1',
    exerciseName: 'Stair Climbing',
    entryDate: '2026-10-08',
    distanceFormatted: null,
    durationMinutes: 16.93,
    formattedPace: null,
    avgHeartRate: 157,
    caloriesBurned: 219,
    floorsClimbed: 56,
    elevationGainMeters: 181.9,
  } as ExerciseActivityQueryItem;

  const RUN_WITH_FORM = {
    ...STAIRS,
    id: 'run-form',
    exerciseName: 'Running',
    floorsClimbed: null,
    elevationGainMeters: null,
    avgCadence: 168,
    strideLengthCm: 104.3,
  } as ExerciseActivityQueryItem;

  it('shows floors climbed and elevation gain for a stair workout', () => {
    mockDetail.mockReturnValue(detail({ route: [] }));
    const screen = render(<CardioSessionScreen {...props(STAIRS)} />);

    expect(screen.getByText('Floors climbed')).toBeTruthy();
    expect(screen.getByText('56 floors')).toBeTruthy();
    expect(screen.getByText('Elevation gain')).toBeTruthy();
    expect(screen.getByText('182 m')).toBeTruthy();
    expect(screen.getByText('157 bpm')).toBeTruthy();
    expect(screen.getByText('219 Cal')).toBeTruthy();
  });

  it('shows elevation in feet when the distance unit is miles', () => {
    mockDetail.mockReturnValue(detail({ route: [] }));
    const imperial = {
      ...props(STAIRS),
      route: {
        key: 'CardioSession',
        name: 'CardioSession',
        params: { session: STAIRS, distanceUnit: 'miles' },
      },
    } as unknown as RootStackScreenProps<'CardioSession'>;
    const screen = render(<CardioSessionScreen {...imperial} />);

    // 181.9 m is the 597 ft Apple Fitness shows.
    expect(screen.getByText('597 ft')).toBeTruthy();
  });

  it('shows cadence and stride length for a run that has them', () => {
    mockDetail.mockReturnValue(detail());
    const run = {
      ...RUN_WITH_FORM,
    } as ExerciseActivityQueryItem;
    const screen = render(<CardioSessionScreen {...props(run)} />);

    expect(screen.getByText('Avg cadence')).toBeTruthy();
    expect(screen.getByText('168 spm')).toBeTruthy();
    expect(screen.getByText('Stride length')).toBeTruthy();
    expect(screen.getByText('1.04 m')).toBeTruthy();
  });

  it('shows stride length in feet when the distance unit is miles', () => {
    mockDetail.mockReturnValue(detail());
    const imperial = {
      ...props(RUN_WITH_FORM),
      route: {
        key: 'CardioSession',
        name: 'CardioSession',
        params: { session: RUN_WITH_FORM, distanceUnit: 'miles' },
      },
    } as unknown as RootStackScreenProps<'CardioSession'>;
    const screen = render(<CardioSessionScreen {...imperial} />);

    // 104.3 cm is 3.42 ft.
    expect(screen.getByText('3.42 ft')).toBeTruthy();
  });

  it('says "1 floor" for a single floor', () => {
    mockDetail.mockReturnValue(detail({ route: [] }));
    const screen = render(
      <CardioSessionScreen
        {...props({ ...STAIRS, floorsClimbed: 1 } as ExerciseActivityQueryItem)}
      />
    );

    expect(screen.getByText('1 floor')).toBeTruthy();
  });

  describe('weather', () => {
    const withWeather = (extra: Partial<ExerciseActivityQueryItem>) =>
      ({ ...STAIRS, ...extra }) as ExerciseActivityQueryItem;
    const imperial = (session: ExerciseActivityQueryItem) =>
      ({
        ...props(session),
        route: {
          key: 'CardioSession',
          name: 'CardioSession',
          params: { session, distanceUnit: 'miles' },
        },
      }) as unknown as RootStackScreenProps<'CardioSession'>;

    it('shows the temperature and conditions at the start', () => {
      mockDetail.mockReturnValue(detail({ route: [] }));
      const screen = render(
        <CardioSessionScreen
          {...props(
            withWeather({
              weatherTempCelsius: 9.4,
              weatherCondition: 'Light rain',
            })
          )}
        />
      );

      expect(screen.getByText('Weather')).toBeTruthy();
      expect(screen.getByText('9°C · Light rain')).toBeTruthy();
    });

    it('shows Fahrenheit with the miles setting', () => {
      mockDetail.mockReturnValue(detail({ route: [] }));
      const screen = render(
        <CardioSessionScreen
          {...imperial(
            withWeather({ weatherTempCelsius: 10, weatherCondition: 'Clear' })
          )}
        />
      );

      expect(screen.getByText('50°F · Clear')).toBeTruthy();
    });

    it('treats 0° as a reading, not as missing', () => {
      mockDetail.mockReturnValue(detail({ route: [] }));
      const screen = render(
        <CardioSessionScreen
          {...props(
            withWeather({ weatherTempCelsius: 0, weatherCondition: null })
          )}
        />
      );

      expect(screen.getByText('0°C')).toBeTruthy();
    });

    it('leaves the tile out when there is no weather', () => {
      mockDetail.mockReturnValue(detail({ route: [] }));
      const screen = render(<CardioSessionScreen {...props(STAIRS)} />);

      expect(screen.queryByText('Weather')).toBeNull();
    });
  });

  it('leaves out floors and elevation when the workout has none', () => {
    mockDetail.mockReturnValue(detail());
    const screen = render(<CardioSessionScreen {...props()} />);

    expect(screen.queryByText('Floors climbed')).toBeNull();
    expect(screen.queryByText('Elevation gain')).toBeNull();
  });

  it('shows the session stats, route, heart rate, and zones', () => {
    mockDetail.mockReturnValue(detail());
    const screen = render(<CardioSessionScreen {...props()} />);
    expect(mockDetail).toHaveBeenCalledWith('run-1', '2026-09-26');
    expect(screen.getByText('5.2 km')).toBeTruthy();
    expect(screen.getByText('5:58 /km')).toBeTruthy();
    expect(screen.getByText('148 bpm')).toBeTruthy();
    expect(
      screen.getByLabelText(
        'Route of this workout, from the green dot to the red ring'
      )
    ).toBeTruthy();
    expect(screen.getByTestId('heart-rate-chart')).toBeTruthy();
    expect(screen.getByText('Avg 150 bpm')).toBeTruthy();
    expect(screen.getByText('Max 170 bpm')).toBeTruthy();
    expect(screen.getByText('Heart Rate Zones')).toBeTruthy();
    expect(screen.getByText('15 min')).toBeTruthy();
  });

  it('titles the native header with the workout name', () => {
    mockDetail.mockReturnValue(detail());
    render(<CardioSessionScreen {...props()} />);
    expect(mockUseScreenHeader).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: 'Morning Run',
        nativeTitle: 'Morning Run',
      })
    );
  });

  it('offers Edit only for a diary entry made in the app', () => {
    mockDetail.mockReturnValue(detail());
    render(<CardioSessionScreen {...props()} />);
    expect(mockUseScreenHeader).toHaveBeenLastCalledWith(
      expect.objectContaining({ right: null })
    );

    const replace = jest.fn();
    const diaryEntry = { id: 'run-1', source: 'sparky' };
    const base = props();
    render(
      <CardioSessionScreen
        {...({
          ...base,
          navigation: { replace },
          route: {
            ...base.route,
            params: { ...base.route.params, diaryEntry },
          },
        } as unknown as RootStackScreenProps<'CardioSession'>)}
      />
    );
    const config = mockUseScreenHeader.mock.lastCall?.[0] as {
      right: { label: string; onPress: () => void };
    };
    expect(config.right.label).toBe('Edit');
    config.right.onPress();
    expect(replace).toHaveBeenCalledWith('ActivityDetail', {
      session: diaryEntry,
    });
  });

  it('shows a brief zone as under a minute, not zero', () => {
    mockDetail.mockReturnValue(
      detail({
        zones: [
          { zone: 2, lowerBpm: 116, upperBpm: 134, seconds: 20, share: 0.02 },
          { zone: 4, lowerBpm: 154, upperBpm: 173, seconds: 1020, share: 0.98 },
        ],
      })
    );
    const screen = render(<CardioSessionScreen {...props()} />);
    expect(screen.getByText('<1 min')).toBeTruthy();
    expect(screen.getByText('17 min')).toBeTruthy();
    expect(screen.queryByText('0 min')).toBeNull();
  });

  it('explains a missing route and still shows heart rate', () => {
    mockDetail.mockReturnValue(detail({ route: [], zones: [] }));
    const screen = render(<CardioSessionScreen {...props()} />);
    expect(screen.getByText(/No GPS route stored/)).toBeTruthy();
    expect(screen.getByTestId('heart-rate-chart')).toBeTruthy();
    expect(screen.queryByText('Heart Rate Zones')).toBeNull();
  });

  it('leaves out the route card for a duration-only workout', () => {
    // A jump rope covers no distance, so it can never have a route.
    const jumpRope = {
      ...SESSION,
      id: 'jump-rope-1',
      exerciseName: 'Jump Rope',
      distanceFormatted: null,
      formattedPace: null,
      modality: 'duration',
    } as ExerciseActivityQueryItem;
    mockDetail.mockReturnValue(detail({ route: [] }));
    const screen = render(<CardioSessionScreen {...props(jumpRope)} />);
    expect(screen.queryByText(/No GPS route stored/)).toBeNull();
    expect(screen.getByTestId('heart-rate-chart')).toBeTruthy();
  });

  it('falls back to the stored average without samples', () => {
    mockDetail.mockReturnValue(detail({ heartRate: [] }));
    const screen = render(<CardioSessionScreen {...props()} />);
    expect(screen.queryByTestId('heart-rate-chart')).toBeNull();
    expect(
      screen.getByText(
        'Average heart rate 148 bpm. Beat-by-beat samples were not stored.'
      )
    ).toBeTruthy();
  });

  it('exports the route as a GPX file', async () => {
    mockDetail.mockReturnValue(detail());
    const screen = render(<CardioSessionScreen {...props()} />);
    fireEvent.press(screen.getByTestId('export-gpx'));
    await waitFor(() =>
      expect(shareRouteAsGpx).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Morning Run',
          day: '2026-09-26',
          points: expect.arrayContaining([
            expect.objectContaining({ lat: 51.5 }),
          ]),
        })
      )
    );
  });

  it('says so when the route cannot be exported', async () => {
    jest.mocked(shareRouteAsGpx).mockRejectedValueOnce(new Error('disk'));
    mockDetail.mockReturnValue(detail());
    const screen = render(<CardioSessionScreen {...props()} />);
    fireEvent.press(screen.getByTestId('export-gpx'));
    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
    );
  });

  it('saves the route and opens it', async () => {
    jest
      .mocked(saveActivityAsRoute)
      .mockResolvedValueOnce({ id: 'r1' } as never);
    const navigate = jest.fn();
    mockDetail.mockReturnValue(detail());
    const screen = render(
      <CardioSessionScreen
        {...({
          ...props(),
          navigation: { navigate },
        } as unknown as RootStackScreenProps<'CardioSession'>)}
      />
    );
    fireEvent.press(screen.getByTestId('save-as-route'));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('RouteDetail', { id: 'r1' })
    );
    // The server names the route after the activity.
    expect(saveActivityAsRoute).toHaveBeenCalledWith('run-1');
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' })
    );
  });

  it('says so when the route cannot be saved', async () => {
    jest.mocked(saveActivityAsRoute).mockRejectedValueOnce(new Error('404'));
    const navigate = jest.fn();
    mockDetail.mockReturnValue(detail());
    const screen = render(
      <CardioSessionScreen
        {...({
          ...props(),
          navigation: { navigate },
        } as unknown as RootStackScreenProps<'CardioSession'>)}
      />
    );
    fireEvent.press(screen.getByTestId('save-as-route'));
    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('offers no way to save a route without one', () => {
    mockDetail.mockReturnValue(detail({ route: [] }));
    const screen = render(<CardioSessionScreen {...props()} />);
    expect(screen.queryByTestId('save-as-route')).toBeNull();
  });

  it('offers no export without a route', () => {
    mockDetail.mockReturnValue(detail({ route: [] }));
    const screen = render(<CardioSessionScreen {...props()} />);
    expect(screen.queryByTestId('export-gpx')).toBeNull();
  });
});
