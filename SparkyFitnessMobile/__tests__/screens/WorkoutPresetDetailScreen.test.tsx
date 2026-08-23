import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WorkoutPresetDetailScreen from '../../src/screens/WorkoutPresetDetailScreen';
import { usePreferences, useCreateWorkoutPreset } from '../../src/hooks';
import { useStartLiveWorkout } from '../../src/hooks/useStartLiveWorkout';
import { loadActiveDraft } from '../../src/services/workoutDraftService';
import { buildPresetStartExercisesPayload } from '../../src/utils/workoutSession';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import type { WorkoutPreset, WorkoutPresetSet } from '../../src/types/workoutPresets';
import type { RootStackScreenProps } from '../../src/types/navigation';
import i18n, { initializeI18n } from '../../src/localization/i18n';

type ScreenProps = RootStackScreenProps<'WorkoutPresetDetail'>;

jest.mock('../../src/hooks', () => ({
  usePreferences: jest.fn(),
  useProfile: jest.fn(() => ({ profile: undefined, isLoading: false, isError: false, refetch: jest.fn() })),
  useServerConnection: jest.fn(() => ({ isConnected: true, isLoading: false })),
  useDeleteWorkoutPreset: jest.fn(() => ({ confirmAndDelete: jest.fn(), isPending: false })),
  useUpdateWorkoutPreset: jest.fn(() => ({ updateWorkoutPreset: jest.fn(), isPending: false })),
  useCreateWorkoutPreset: jest.fn(() => ({ createPresetAsync: jest.fn(), isPending: false })),
}));

jest.mock('../../src/hooks/useStartLiveWorkout', () => ({
  useStartLiveWorkout: jest.fn(),
}));

// Force the custom (non-native) header path so header action buttons render
// as pressable React elements instead of being handed off to
// unstable_header*Items, which the test renderer can't press.
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSTabsActive: jest.fn(() => false),
  useNativeIOSHeadersActive: jest.fn(() => false),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

jest.mock('../../src/services/workoutDraftService', () => ({
  loadActiveDraft: jest.fn(),
  clearDraft: jest.fn(),
}));

const mockNavigation = {
  setOptions: jest.fn(),
  navigate: jest.fn(),
  push: jest.fn(),
  goBack: jest.fn(),
} as unknown as ScreenProps['navigation'];
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
  // useExerciseImageSource refreshes its cache on focus; a no-op keeps
  // rendering synchronous outside a NavigationContainer.
  useFocusEffect: jest.fn(),
}));

const mockUsePreferences = usePreferences as jest.MockedFunction<typeof usePreferences>;
const mockLoadActiveDraft = loadActiveDraft as jest.MockedFunction<typeof loadActiveDraft>;
const mockUseStartLiveWorkout = useStartLiveWorkout as jest.MockedFunction<
  typeof useStartLiveWorkout
>;
const mockUseCreateWorkoutPreset = useCreateWorkoutPreset as jest.MockedFunction<
  typeof useCreateWorkoutPreset
>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function buildSet(overrides: Partial<WorkoutPresetSet> = {}): WorkoutPresetSet {
  return {
    id: 'set-1',
    set_number: 1,
    set_type: 'normal',
    reps: null,
    weight: null,
    duration: null,
    rest_time: 60,
    notes: null,
    ...overrides,
  };
}

function buildPreset(overrides: Partial<WorkoutPreset> = {}): WorkoutPreset {
  return {
    id: 7,
    user_id: 'user-1',
    name: 'Push Day',
    description: 'Chest, shoulders, triceps',
    is_public: false,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    exercises: [],
    ...overrides,
  };
}

describe('WorkoutPresetDetailScreen', () => {
  const navigation = mockNavigation;
  const startLiveWorkout = jest.fn();

  const renderScreen = (preset: WorkoutPreset) => {
    const route = {
      key: 'WorkoutPresetDetail-key',
      name: 'WorkoutPresetDetail' as const,
      params: { preset },
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider initialMetrics={{ insets, frame }}>
          <WorkoutPresetDetailScreen navigation={navigation} route={route} />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
  };

  beforeEach(async () => {
    await initializeI18n('en');
    await i18n.changeLanguage('en');
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
    mockUsePreferences.mockReturnValue({
      preferences: { default_weight_unit: 'kg' },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);
    mockLoadActiveDraft.mockResolvedValue(null);
    mockUseStartLiveWorkout.mockReturnValue({ startLiveWorkout, isStarting: false });
    mockUseCreateWorkoutPreset.mockReturnValue({
      createPresetAsync: jest.fn(),
      isPending: false,
    });
  });

  it('renders application-owned strings in Polish while preserving literal user content', async () => {
    await i18n.changeLanguage('pl');
    const preset = buildPreset({ exercises: [{ id: 'pe-1', exercise_id: 'ex-1', exercise_name: 'Bench Press', image_url: null, sets: [buildSet()] }] });
    const screen = renderScreen(preset);
    expect(screen.getByText('Rozpocznij trening')).toBeTruthy();
    expect(screen.getByText('Zapisz wcześniejszy trening')).toBeTruthy();
    expect(screen.getByText('Powiel szablon')).toBeTruthy();
    expect(screen.getByText('1 ćwiczenie')).toBeTruthy();
    expect(screen.getByText('Push Day')).toBeTruthy();
    expect(screen.getByText('Bench Press')).toBeTruthy();
  });

  it('updates visible strings on an EN to PL runtime language switch without remounting', async () => {
    const screen = renderScreen(buildPreset({ exercises: [{ id: 'pe-1', exercise_id: 'ex-1', exercise_name: 'Bench Press', image_url: null, sets: [buildSet()] }] }));
    expect(screen.getByText('Start workout')).toBeTruthy();
    expect(screen.getByText('Duplicate preset')).toBeTruthy();
    await act(async () => { await i18n.changeLanguage('pl'); });
    expect(screen.getByText('Rozpocznij trening')).toBeTruthy();
    expect(screen.getByText('Powiel szablon')).toBeTruthy();
    expect(screen.getByText('Push Day')).toBeTruthy();
    expect(screen.getByText('Bench Press')).toBeTruthy();
  });

  it('uses the localized Polish copy-name contract and success presentation when duplicating', async () => {
    const createPresetAsync = jest.fn().mockResolvedValue(buildPreset({ id: 8, name: 'Push Day (kopia)' }));
    mockUseCreateWorkoutPreset.mockReturnValue({ createPresetAsync, isPending: false });
    await i18n.changeLanguage('pl');
    const screen = renderScreen(buildPreset());
    fireEvent.press(screen.getByLabelText('Powiel szablon treningu'));
    await waitFor(() => expect(createPresetAsync).toHaveBeenCalledWith(expect.objectContaining({ name: 'Push Day (kopia)' })));
    expect(createPresetAsync.mock.calls[0][0].name).toContain('Push Day');
  });

  it('starts a live workout with the preset-built payload on Start workout', () => {
    const preset = buildPreset({
      exercises: [
        {
          id: 'pe-1',
          exercise_id: 'ex-1',
          exercise_name: 'Bench Press',
          image_url: null,
          sets: [buildSet()],
        },
      ],
    });
    const screen = renderScreen(preset);

    fireEvent.press(screen.getByText('Start workout'));

    expect(startLiveWorkout).toHaveBeenCalledWith({
      name: 'Push Day',
      exercises: buildPresetStartExercisesPayload(preset),
      sourcePresetId: 7,
    });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('duplicates the preset (available even though the fixture profile does not own it) into a private copy with the original exercises/sets', async () => {
    const created = buildPreset({ id: 8, name: 'Push Day (Copy)' });
    const createPresetAsync = jest.fn().mockResolvedValue(created);
    mockUseCreateWorkoutPreset.mockReturnValue({ createPresetAsync, isPending: false });

    const preset = buildPreset({
      exercises: [
        {
          id: 'pe-1',
          exercise_id: 'ex-1',
          exercise_name: 'Bench Press',
          image_url: null,
          sets: [buildSet({ id: 's-1', set_number: 1, reps: 5, weight: 100 })],
        },
      ],
    });
    const screen = renderScreen(preset);

    fireEvent.press(screen.getByLabelText('Duplicate workout preset'));

    await waitFor(() => expect(createPresetAsync).toHaveBeenCalledTimes(1));
    expect(createPresetAsync).toHaveBeenCalledWith({
      name: 'Push Day (Copy)',
      description: 'Chest, shoulders, triceps',
      is_public: false,
      exercises: [
        {
          exercise_id: 'ex-1',
          image_url: null,
          sort_order: 0,
          superset_group: undefined,
          sets: [
            {
              set_number: 1,
              set_type: 'normal',
              reps: 5,
              weight: 100,
              duration: null,
              distance: undefined,
              rest_time: 60,
              notes: null,
            },
          ],
        },
      ],
    });
    await waitFor(() => {
      // push, not navigate: this runs from WorkoutPresetDetail itself, and
      // navigate() to the already-focused route would replace its params
      // instead of pushing a new screen, silently turning the original
      // detail screen into the copy.
      expect(navigation.push).toHaveBeenCalledWith('WorkoutPresetDetail', {
        preset: created,
      });
    });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('re-indexes sort_order from array position on duplicate (the read query never returns it)', async () => {
    const createPresetAsync = jest.fn().mockResolvedValue(buildPreset({ id: 8 }));
    mockUseCreateWorkoutPreset.mockReturnValue({ createPresetAsync, isPending: false });

    const preset = buildPreset({
      exercises: [
        {
          id: 'pe-1',
          exercise_id: 'ex-1',
          exercise_name: 'Bench Press',
          image_url: null,
          sets: [buildSet()],
        },
        {
          id: 'pe-2',
          exercise_id: 'ex-2',
          exercise_name: 'Squat',
          image_url: null,
          sets: [buildSet()],
        },
      ],
    });
    const screen = renderScreen(preset);

    fireEvent.press(screen.getByLabelText('Duplicate workout preset'));

    await waitFor(() => expect(createPresetAsync).toHaveBeenCalledTimes(1));
    const sentExercises = createPresetAsync.mock.calls[0][0].exercises;
    expect(sentExercises.map((e: { sort_order: number }) => e.sort_order)).toEqual([0, 1]);
  });

  it('navigates to WorkoutAdd with the preset and popCount=2 on Log past workout', async () => {
    const preset = buildPreset();
    const screen = renderScreen(preset);

    fireEvent.press(screen.getByText('Log past workout'));
    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('WorkoutAdd', {
        preset,
        popCount: 2,
        date: expect.any(String),
      });
    });
    expect(startLiveWorkout).not.toHaveBeenCalled();
  });

  it('prompts with Polish draft actions before logging a past preset workout', async () => {
    await i18n.changeLanguage('pl');
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockLoadActiveDraft.mockResolvedValue({
      type: 'workout',
      name: 'Draft',
      nameManuallySet: true,
      entryDate: '2026-06-23',
      exercises: [
        {
          clientId: 'draft-exercise',
          exerciseId: 'exercise-1',
          exerciseName: 'Bench Press',
          exerciseCategory: null,
          images: [],
          sets: [
            {
              clientId: 'draft-set',
              weight: '100',
              reps: '5',
              restTime: 90,
            },
          ],
        },
      ],
    });
    const screen = renderScreen(buildPreset());

    fireEvent.press(screen.getByText('Zapisz wcześniejszy trening'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Niezapisany szkic',
        expect.any(String),
        expect.any(Array),
      );
    });

    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    expect(buttons.map((button) => button.text)).toEqual(
      expect.arrayContaining(['Wznów szkic', 'Odrzuć i kontynuuj']),
    );
    buttons.find((button) => button.text === 'Wznów szkic')?.onPress?.();
    expect(navigation.navigate).toHaveBeenCalledWith('WorkoutAdd');
  });

  it.each([
    [1, '1 ćwiczenie'],
    [2, '2 ćwiczenia'],
    [5, '5 ćwiczeń'],
    [22, '22 ćwiczenia'],
    [25, '25 ćwiczeń'],
  ])('renders the Polish exercise count for %i exercises', async (count, expected) => {
    await i18n.changeLanguage('pl');
    const preset = buildPreset({
      exercises: Array.from({ length: count as number }, (_, index) => ({
        id: `pe-${index + 1}`,
        exercise_id: `ex-${index + 1}`,
        exercise_name: `Exercise ${index + 1}`,
        image_url: null,
        sets: [buildSet()],
      })),
    });
    const screen = renderScreen(preset);
    expect(screen.getByText(expected as string)).toBeTruthy();
  });

  it('renders preset name, description, and exercise count', () => {
    const preset = buildPreset({
      exercises: [
        {
          id: 'pe-1',
          exercise_id: 'ex-1',
          exercise_name: 'Bench Press',
          image_url: null,
          sets: [buildSet()],
        },
      ],
    });
    const screen = renderScreen(preset);

    // The name lives in the header title (rendered as plain text on this
    // file's forced custom header path); the body keeps the description,
    // exercise count, and the exercise card.
    expect(screen.getByText('Push Day')).toBeTruthy();
    expect(screen.getByText('Chest, shoulders, triceps')).toBeTruthy();
    expect(screen.getByText('1 exercise')).toBeTruthy();
    expect(screen.getByText('Bench Press')).toBeTruthy();
  });

  it('renders set weight/reps in the card table, expanded by default (kg)', () => {
    const preset = buildPreset({
      exercises: [
        {
          id: 'pe-1',
          exercise_id: 'ex-1',
          exercise_name: 'Bench Press',
          image_url: null,
          sets: [buildSet({ id: 's-1', set_number: 1, reps: 5, weight: 100 })],
        },
      ],
    });
    const screen = renderScreen(preset);

    // No expand tap needed — preset cards default expanded.
    expect(screen.getByText('kg')).toBeTruthy();
    expect(screen.getByText('100')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('hides RPE from the metric picker and shows an rpe selection as Volume', () => {
    useAppPreferencesStore.getState().setActiveWorkoutMetricColumn('rpe');
    const preset = buildPreset({
      exercises: [
        {
          id: 'pe-1',
          exercise_id: 'ex-1',
          exercise_name: 'Bench Press',
          image_url: null,
          sets: [buildSet({ id: 's-1', set_number: 1, reps: 5, weight: 100 })],
        },
      ],
    });
    const screen = renderScreen(preset);

    // Preset sets store no RPE: the shared 'rpe' preference displays as the
    // volume column instead of an all-dashes RPE column.
    expect(screen.getByText('Vol')).toBeTruthy();
    expect(screen.queryByText('RPE')).toBeNull();

    fireEvent.press(screen.getByLabelText('Change metric column'));
    expect(screen.queryByText('RPE')).toBeNull();
    expect(screen.getByText('✓ Volume')).toBeTruthy();
  });

  it('converts kg to lbs when the user prefers lbs', () => {
    mockUsePreferences.mockReturnValue({
      preferences: { default_weight_unit: 'lbs' },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);
    const preset = buildPreset({
      exercises: [
        {
          id: 'pe-1',
          exercise_id: 'ex-1',
          exercise_name: 'Bench Press',
          image_url: null,
          sets: [buildSet({ id: 's-1', set_number: 1, reps: 5, weight: 100 })],
        },
      ],
    });
    const screen = renderScreen(preset);

    // 100kg → ~220.5 lbs
    expect(screen.getByText('lbs')).toBeTruthy();
    expect(screen.getByText('220.5')).toBeTruthy();
  });

  it('coerces st_lbs to lbs for display rather than passing it to weightFromKg', () => {
    mockUsePreferences.mockReturnValue({
      preferences: { default_weight_unit: 'st_lbs' },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);
    const preset = buildPreset({
      exercises: [
        {
          id: 'pe-1',
          exercise_id: 'ex-1',
          exercise_name: 'Bench Press',
          image_url: null,
          sets: [buildSet({ id: 's-1', set_number: 1, reps: 5, weight: 100 })],
        },
      ],
    });
    const screen = renderScreen(preset);

    expect(screen.getByText('220.5')).toBeTruthy();
  });

  it('shows one exercise-level rest chip spanning the min-max of its sets when rest times differ', () => {
    const preset = buildPreset({
      exercises: [
        {
          id: 'pe-1',
          exercise_id: 'ex-1',
          exercise_name: 'Bench Press',
          image_url: null,
          sets: [
            buildSet({ id: 's-1', set_number: 1, reps: 5, weight: 100, rest_time: 45 }),
            buildSet({ id: 's-2', set_number: 2, reps: 5, weight: 100, rest_time: 90 }),
            buildSet({ id: 's-3', set_number: 3, reps: 5, weight: 100, rest_time: 120 }),
          ],
        },
      ],
    });
    const screen = renderScreen(preset);

    expect(screen.getByLabelText('Rest 45s-2:00')).toBeTruthy();
    expect(screen.queryByLabelText('Rest 45s')).toBeNull();
    expect(screen.queryByLabelText('Rest 1:30')).toBeNull();
    expect(screen.queryByLabelText('Rest 2:00')).toBeNull();
  });

  it('renders a superset rail on each grouped exercise', () => {
    const preset = buildPreset({
      exercises: [
        {
          id: 801,
          exercise_id: 'ex-1',
          exercise_name: 'Bench Press',
          image_url: null,
          superset_group: 1,
          sets: [buildSet({ id: 's-1' })],
        },
        {
          id: 802,
          exercise_id: 'ex-2',
          exercise_name: 'Bent-over Row',
          image_url: null,
          superset_group: 1,
          sets: [buildSet({ id: 's-2' })],
        },
        {
          id: 803,
          exercise_id: 'ex-3',
          exercise_name: 'Plank',
          image_url: null,
          superset_group: null,
          sets: [buildSet({ id: 's-3' })],
        },
      ],
    } as never);
    const screen = renderScreen(preset);

    expect(screen.getByTestId('superset-rail-801')).toBeTruthy();
    expect(screen.getByTestId('superset-rail-802')).toBeTruthy();
    expect(screen.queryByTestId('superset-rail-803')).toBeNull();
  });

  it('renders a duration-modality exercise with a SEC column of raw seconds', () => {
    const preset = buildPreset({
      exercises: [
        {
          id: 'pe-1',
          exercise_id: 'ex-1',
          exercise_name: 'Plank',
          image_url: null,
          modality: 'duration',
          sets: [
            buildSet({ id: 's-1', set_number: 1, duration: 45 }),
            buildSet({ id: 's-2', set_number: 2, duration: 90 }),
          ],
        },
      ],
    });
    const screen = renderScreen(preset);

    expect(screen.getByText('Sec')).toBeTruthy();
    expect(screen.getByText('45')).toBeTruthy();
    expect(screen.getByText('90')).toBeTruthy();
  });

});
