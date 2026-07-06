import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PresetSearchScreen from '../../src/screens/PresetSearchScreen';
import { useWorkoutPresets, useWorkoutPresetSearch } from '../../src/hooks';
import { useScreenHeader } from '../../src/hooks/useScreenHeader';
import { useStartLiveWorkout } from '../../src/hooks/useStartLiveWorkout';
import {
  buildPresetStartExercisesPayload,
  buildSingleExerciseStartPayload,
} from '../../src/utils/workoutSession';
import type { Exercise } from '../../src/types/exercise';
import type { WorkoutPreset } from '../../src/types/workoutPresets';

jest.mock('../../src/hooks', () => ({
  useWorkoutPresets: jest.fn(),
  useWorkoutPresetSearch: jest.fn(),
  useRefetchOnFocus: jest.fn(),
}));

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));

jest.mock('../../src/hooks/useStartLiveWorkout', () => ({
  useStartLiveWorkout: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: jest.fn(() => false),
}));

const mockUseWorkoutPresets = useWorkoutPresets as jest.MockedFunction<typeof useWorkoutPresets>;
const mockUseWorkoutPresetSearch = useWorkoutPresetSearch as jest.MockedFunction<
  typeof useWorkoutPresetSearch
>;
const mockUseScreenHeader = useScreenHeader as jest.MockedFunction<typeof useScreenHeader>;
const mockUseStartLiveWorkout = useStartLiveWorkout as jest.MockedFunction<
  typeof useStartLiveWorkout
>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function buildPreset(overrides: Partial<WorkoutPreset> = {}): WorkoutPreset {
  return {
    id: 'preset-1',
    user_id: 'user-1',
    name: 'Push Day',
    description: null,
    is_public: false,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    exercises: [
      {
        id: 'pe-1',
        exercise_id: 'ex-1',
        exercise_name: 'Bench Press',
        image_url: null,
        sets: [],
      },
    ],
    ...overrides,
  };
}

function buildExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex-9',
    name: 'Squat',
    category: 'Strength',
    images: [],
    ...overrides,
  } as Exercise;
}

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
  isFocused: jest.fn(() => true),
  setOptions: jest.fn(),
} as any;

type RouteParams = { selectedExercise?: Exercise; selectionNonce?: number } | undefined;

function makeRoute(params?: RouteParams) {
  return { key: 'PresetSearch-key', name: 'PresetSearch' as const, params };
}

function renderScreen(params?: RouteParams) {
  return render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <PresetSearchScreen navigation={navigation} route={makeRoute(params)} />
    </SafeAreaProvider>,
  );
}

describe('PresetSearchScreen', () => {
  const startLiveWorkout = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWorkoutPresets.mockReturnValue({
      presets: [buildPreset()],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);
    mockUseWorkoutPresetSearch.mockReturnValue({
      searchResults: [],
      isSearching: false,
      isSearchActive: false,
      isSearchError: false,
    } as any);
    mockUseStartLiveWorkout.mockReturnValue({ startLiveWorkout, isStarting: false });
  });

  it('titles the header "Start Workout" and renders the pinned empty-workout row', () => {
    const screen = renderScreen();

    expect(mockUseScreenHeader).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Start Workout' }),
    );
    expect(screen.getByText('Empty workout')).toBeTruthy();
    expect(screen.getByText('Pick your first exercise')).toBeTruthy();
  });

  it('starts a live workout from a tapped preset with the preset-built payload', () => {
    const preset = buildPreset();
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Push Day'));

    expect(startLiveWorkout).toHaveBeenCalledWith({
      name: 'Push Day',
      exercises: buildPresetStartExercisesPayload(preset),
    });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('routes the empty-workout row to ExerciseSearch with this screen as return target', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Empty workout'));

    expect(navigation.navigate).toHaveBeenCalledWith('ExerciseSearch', {
      returnKey: 'PresetSearch-key',
    });
    expect(startLiveWorkout).not.toHaveBeenCalled();
  });

  it('starts a single-exercise workout when ExerciseSearch returns a pick', () => {
    const exercise = buildExercise();
    const screen = renderScreen();

    screen.rerender(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <PresetSearchScreen
          navigation={navigation}
          route={makeRoute({ selectedExercise: exercise, selectionNonce: 1 })}
        />
      </SafeAreaProvider>,
    );

    expect(startLiveWorkout).toHaveBeenCalledTimes(1);
    expect(startLiveWorkout).toHaveBeenCalledWith({
      exercises: buildSingleExerciseStartPayload(exercise),
    });
  });

  it('does not re-fire the start for the same selection nonce', () => {
    const exercise = buildExercise();
    const screen = renderScreen({ selectedExercise: exercise, selectionNonce: 1 });

    expect(startLiveWorkout).toHaveBeenCalledTimes(1);

    screen.rerender(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <PresetSearchScreen
          navigation={navigation}
          route={makeRoute({ selectedExercise: exercise, selectionNonce: 1 })}
        />
      </SafeAreaProvider>,
    );

    expect(startLiveWorkout).toHaveBeenCalledTimes(1);
  });

  it('disables preset rows and the empty row while a start is in flight', () => {
    mockUseStartLiveWorkout.mockReturnValue({ startLiveWorkout, isStarting: true });
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Push Day'));
    fireEvent.press(screen.getByText('Empty workout'));

    expect(startLiveWorkout).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
