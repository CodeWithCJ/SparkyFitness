import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { ExerciseDashboardSummary } from '@workspace/shared';

import ExerciseStatisticsScreen from '../../src/screens/ExerciseStatisticsScreen';
import { useExerciseDashboard } from '../../src/hooks/useExerciseDashboard';
import { usePreferences } from '../../src/hooks/usePreferences';
import { useCardioSessions } from '../../src/hooks/useCardioSessions';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/hooks/useExerciseDashboard', () => ({
  useExerciseDashboard: jest.fn(),
}));

let mockGender: 'male' | 'female' | null = null;
jest.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: { gender: mockGender } }),
}));

jest.mock('../../src/hooks/useTrainingConsistency', () => ({
  useTrainingConsistency: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
  }),
}));

jest.mock('../../src/hooks/useCardioSessions', () => ({
  useCardioSessions: jest.fn(),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(() => ({
    preferences: { default_weight_unit: 'kg' },
  })),
}));

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
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
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('../../src/utils/dateUtils', () => ({
  ...jest.requireActual('../../src/utils/dateUtils'),
  getTodayDate: () => '2026-09-27',
}));

const mockUseExerciseDashboard = useExerciseDashboard as jest.MockedFunction<
  typeof useExerciseDashboard
>;
const mockUseCardioSessions = useCardioSessions as jest.MockedFunction<
  typeof useCardioSessions
>;
const mockUsePreferences = usePreferences as jest.MockedFunction<
  typeof usePreferences
>;

const DASHBOARD: ExerciseDashboardSummary = {
  keyStats: { totalWorkouts: 6, totalVolume: 12000, totalReps: 480 },
  muscleGroupVolume: { Chest: 5000, Quadriceps: 7000 },
  muscleGroupSets: { Chest: 12, Abs: 3, Abdominals: 2, Neck: 4 },
  consistencyData: {
    currentStreak: 2,
    longestStreak: 4,
    weeklyFrequency: 3,
    monthlyFrequency: 6,
  },
  recoveryData: { Chest: '2026-09-26', Quadriceps: '2026-09-20' },
  exerciseVarietyData: { Chest: 3, Quadriceps: 1 },
};

type DashboardResult = ReturnType<typeof useExerciseDashboard>;
type CardioResult = ReturnType<typeof useCardioSessions>;

const RUN = {
  id: 'run-1',
  exerciseName: 'Morning Run',
  entryDate: '2026-09-26',
  distanceFormatted: 5.2,
  caloriesBurned: 400,
  durationMinutes: 31,
} as CardioResult['sessions'][number];
const BIKE = {
  id: 'bike-1',
  exerciseName: 'Indoor Bike',
  entryDate: '2026-08-14',
  distanceFormatted: null,
  caloriesBurned: 0,
  durationMinutes: 45,
} as CardioResult['sessions'][number];

function cardioResult(overrides: Partial<CardioResult> = {}): CardioResult {
  return {
    sessions: [RUN, BIKE],
    distanceUnit: 'km',
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    ...overrides,
  } as CardioResult;
}

function dashboardResult(
  overrides: Partial<DashboardResult> = {}
): DashboardResult {
  return {
    data: DASHBOARD,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  } as DashboardResult;
}

const navigation = { navigate: jest.fn() };
const props = {
  navigation,
  route: { key: 'ExerciseStatistics', name: 'ExerciseStatistics' },
} as unknown as RootStackScreenProps<'ExerciseStatistics'>;

describe('ExerciseStatisticsScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    mockUseExerciseDashboard.mockReset();
    mockUseExerciseDashboard.mockReturnValue(dashboardResult());
    navigation.navigate.mockReset();
    mockGender = null;
    mockUseCardioSessions.mockReturnValue(cardioResult());
    mockUsePreferences.mockReturnValue({
      preferences: { default_weight_unit: 'kg' },
    } as ReturnType<typeof usePreferences>);
  });

  it('lists set counts per muscle, combining aliases the figure shares', () => {
    const screen = render(<ExerciseStatisticsScreen {...props} />);
    expect(screen.getByText('Sets per Muscle')).toBeTruthy();
    expect(screen.getAllByText('12 sets').length).toBeGreaterThan(0);
    // Abs + Abdominals tint one region, so they are one row.
    expect(screen.getByText('5 sets')).toBeTruthy();
  });

  it('keeps muscles the figure does not draw in their own list', () => {
    const screen = render(<ExerciseStatisticsScreen {...props} />);
    expect(screen.getByText('Not on the figure')).toBeTruthy();
    expect(screen.getAllByText('Neck')).toHaveLength(2);
  });

  it('shows a tapped muscle and its sets, and clears on a second tap', () => {
    const screen = render(<ExerciseStatisticsScreen {...props} />);
    expect(screen.getByText('Tap a muscle')).toBeTruthy();

    fireEvent.press(screen.getAllByTestId('muscle-figure-abdominals')[0]);
    expect(screen.queryByText('Tap a muscle')).toBeNull();
    expect(screen.getByText(' · 5 sets')).toBeTruthy();

    fireEvent.press(screen.getAllByTestId('muscle-figure-abdominals')[0]);
    expect(screen.getByText('Tap a muscle')).toBeTruthy();
  });

  it('picks a muscle from its set row, for screen readers', () => {
    const screen = render(<ExerciseStatisticsScreen {...props} />);
    const row = screen.getByTestId('muscle-row-abdominals');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityState).toMatchObject({ selected: false });

    fireEvent.press(row);
    expect(screen.getByText(' · 5 sets')).toBeTruthy();
    expect(
      screen.getByTestId('muscle-row-abdominals').props.accessibilityState
    ).toMatchObject({ selected: true });

    fireEvent.press(screen.getByTestId('muscle-row-abdominals'));
    expect(screen.getByText('Tap a muscle')).toBeTruthy();
  });

  it('leaves rows for muscles off the figure inert', () => {
    const screen = render(<ExerciseStatisticsScreen {...props} />);
    const row = screen.getByTestId('muscle-row-neck');
    expect(row.props.accessibilityRole).toBeUndefined();
    fireEvent.press(row);
    expect(screen.getByText('Tap a muscle')).toBeTruthy();
  });

  it('starts on the figure for the stored gender', () => {
    mockGender = 'female';
    const screen = render(<ExerciseStatisticsScreen {...props} />);
    expect(screen.getByTestId('muscle-figure-female-body')).toBeTruthy();
    expect(screen.queryByTestId('muscle-figure-male-body')).toBeNull();
  });

  it('switches figures without clearing the counts', () => {
    const screen = render(<ExerciseStatisticsScreen {...props} />);
    expect(screen.getByTestId('muscle-figure-male-body')).toBeTruthy();

    fireEvent.press(screen.getAllByTestId('muscle-figure-abdominals')[0]);
    expect(screen.getByText(' · 5 sets')).toBeTruthy();

    fireEvent.press(screen.getByText('Female'));
    expect(screen.getByTestId('muscle-figure-female-body')).toBeTruthy();
    // The pick belongs to the figure it was made on.
    expect(screen.getByText('Tap a muscle')).toBeTruthy();
    fireEvent.press(screen.getAllByTestId('muscle-figure-abdominals')[0]);
    expect(screen.getByText(' · 5 sets')).toBeTruthy();
  });

  it('opens one extra analysis section at a time', () => {
    const screen = render(<ExerciseStatisticsScreen {...props} />);
    expect(screen.queryByText('Yesterday')).toBeNull();

    fireEvent.press(screen.getByText('Last Trained'));
    expect(screen.getByText('Yesterday')).toBeTruthy();
    expect(screen.getByText('7 days ago')).toBeTruthy();

    fireEvent.press(screen.getByText('Exercise Variety'));
    expect(screen.queryByText('Yesterday')).toBeNull();
    expect(screen.getByText('3 exercises')).toBeTruthy();
  });

  it('converts volume to the preferred weight unit', () => {
    mockUsePreferences.mockReturnValue({
      preferences: { default_weight_unit: 'lbs' },
    } as ReturnType<typeof usePreferences>);
    const screen = render(<ExerciseStatisticsScreen {...props} />);
    expect(screen.getByText('26,455 lbs')).toBeTruthy();
  });

  it('drives the query from the range control', () => {
    const screen = render(<ExerciseStatisticsScreen {...props} />);
    expect(mockUseExerciseDashboard).toHaveBeenLastCalledWith('30d');
    fireEvent.press(screen.getByText('7d'));
    expect(mockUseExerciseDashboard).toHaveBeenLastCalledWith('7d');
  });

  it('lists cardio sessions by month and opens one', () => {
    const screen = render(<ExerciseStatisticsScreen {...props} />);
    expect(mockUseCardioSessions).toHaveBeenLastCalledWith('30d', false);

    fireEvent.press(screen.getByText('Cardio'));
    expect(mockUseCardioSessions).toHaveBeenLastCalledWith('30d', true);
    expect(screen.queryByText('Sets per Muscle')).toBeNull();
    expect(screen.getByText('September 2026')).toBeTruthy();
    expect(screen.getByText('August 2026')).toBeTruthy();
    expect(screen.getByText('5.20 km')).toBeTruthy();
    expect(screen.getByText('Yesterday')).toBeTruthy();
    // No distance or calories, so the session leads with its minutes.
    expect(screen.getByText('45 min')).toBeTruthy();

    fireEvent.press(screen.getByText('Morning Run'));
    expect(navigation.navigate).toHaveBeenCalledWith('CardioSession', {
      session: RUN,
      distanceUnit: 'km',
    });
  });

  it('loads older cardio sessions on request', () => {
    const fetchNextPage = jest.fn();
    mockUseCardioSessions.mockReturnValue(
      cardioResult({ hasNextPage: true, fetchNextPage })
    );
    const screen = render(<ExerciseStatisticsScreen {...props} />);
    fireEvent.press(screen.getByText('Cardio'));
    fireEvent.press(screen.getByText('Older sessions'));
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it('says when the range has no cardio', () => {
    mockUseCardioSessions.mockReturnValue(cardioResult({ sessions: [] }));
    const screen = render(<ExerciseStatisticsScreen {...props} />);
    fireEvent.press(screen.getByText('Cardio'));
    expect(screen.getByText('No cardio workouts in this range')).toBeTruthy();
  });

  it('shows an empty state when the range has no workouts', () => {
    mockUseExerciseDashboard.mockReturnValue(
      dashboardResult({
        data: {
          ...DASHBOARD,
          keyStats: { totalWorkouts: 0, totalVolume: 0, totalReps: 0 },
          muscleGroupSets: {},
        },
      })
    );
    const screen = render(<ExerciseStatisticsScreen {...props} />);
    expect(screen.getByText('No workouts in this range')).toBeTruthy();
    expect(screen.queryByText('Sets per Muscle')).toBeNull();
  });

  it('keeps showing cached stats when a refetch fails', () => {
    mockUseExerciseDashboard.mockReturnValue(
      dashboardResult({ isError: true })
    );
    const screen = render(<ExerciseStatisticsScreen {...props} />);
    expect(screen.getByText('Sets per Muscle')).toBeTruthy();
    expect(screen.queryByText('Failed to load exercise statistics')).toBeNull();
  });

  it('shows an error state when the dashboard fails to load', () => {
    mockUseExerciseDashboard.mockReturnValue(
      dashboardResult({ data: undefined, isError: true })
    );
    const screen = render(<ExerciseStatisticsScreen {...props} />);
    expect(screen.getByText('Failed to load exercise statistics')).toBeTruthy();
  });
});
