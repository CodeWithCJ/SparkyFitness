import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ActiveWorkoutBar, { isClosingToTabsTransition } from '../../src/components/ActiveWorkoutBar';

const mockRestState = { value: 'resting' as 'resting' | 'paused' | 'ready' };
const mockExerciseName = { value: null as string | null };
const mockPauseRest = jest.fn();
const mockResumeRest = jest.fn();
const mockDismissRest = jest.fn();
const mockCompleteActiveSet = jest.fn();
const mockClearWorkout = jest.fn();
const mockFlush = jest.fn().mockResolvedValue(false);

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: ({ name }: { name: string }) => <View testID={`icon-${name}`} /> };
});

jest.mock('../../src/stores/activeWorkoutStore', () => {
  const state = {
    sessionId: 'session-1',
    session: null,
    activeSetId: 'set-1',
    previousSessionSets: [],
    plannedSetValues: {},
    pauseRest: mockPauseRest,
    resumeRest: mockResumeRest,
    dismissRest: mockDismissRest,
    completeActiveSet: mockCompleteActiveSet,
    clearWorkout: mockClearWorkout,
  };
  const useStore = (selector: (value: typeof state) => unknown) => selector(state);
  useStore.getState = () => ({
    ...state,
    pauseRest: mockPauseRest,
    resumeRest: mockResumeRest,
    dismissRest: mockDismissRest,
    completeActiveSet: mockCompleteActiveSet,
    clearWorkout: mockClearWorkout,
  });
  return { __esModule: true, useActiveWorkoutStore: useStore };
});

jest.mock('../../src/hooks/useRestCountdown', () => ({
  useRestCountdown: () => ({ state: mockRestState.value, remainingMs: 45_000, progress: 0.5 }),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_weight_unit: 'lbs' } }),
}));

jest.mock('../../src/hooks/useActiveWorkoutAutosave', () => ({
  flushActiveWorkoutBeforeClear: (...args: unknown[]) => mockFlush(...args),
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSTabsActive: () => false,
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({}),
}));

jest.mock('../../src/utils/workoutSession', () => {
  const actual = jest.requireActual('../../src/utils/workoutSession');
  return {
    ...actual,
    describeActiveSetAssumed: () => ({
      exerciseName: mockExerciseName.value,
      setNumber: 2,
      setCount: 4,
      weight: 135,
      reps: 8,
    }),
    formatSetLoad: () => '135 lbs × 8',
    normalizeWeightUnit: () => 'lbs',
    formatRestCountdown: () => '0:45',
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function setTestLocale(locale: 'en' | 'pl'): void {
  (globalThis as typeof globalThis & {
    __setTestLocale: (value: 'en' | 'pl') => void;
  }).__setTestLocale(locale);
}

// Root stack [Tabs, ActiveWorkout]: the top route is suppressed and sits
// directly above Tabs — the state where the suppression bypass can apply.
const onActiveWorkout = { tabsUnderTop: true, topRouteKey: 'ActiveWorkout-1' };

describe('isClosingToTabsTransition', () => {
  it('is true while the top route itself is closing toward Tabs', () => {
    expect(
      isClosingToTabsTransition(onActiveWorkout, {
        phase: 'start',
        closing: true,
        routeKey: 'ActiveWorkout-1',
      }),
    ).toBe(true);
    expect(
      isClosingToTabsTransition(onActiveWorkout, {
        phase: 'end',
        closing: true,
        routeKey: 'ActiveWorkout-1',
      }),
    ).toBe(true);
  });

  it('trusts a transition with no route key', () => {
    expect(
      isClosingToTabsTransition(onActiveWorkout, {
        phase: 'start',
        closing: true,
        routeKey: null,
      }),
    ).toBe(true);
  });

  // Regression: popping ExerciseSearch back onto ActiveWorkout leaves the
  // snapshot at end/closing with the dismissed route's key. The bar must stay
  // hidden on the ActiveWorkout screen it landed on.
  it('is false when the closing route is no longer the top route', () => {
    expect(
      isClosingToTabsTransition(onActiveWorkout, {
        phase: 'end',
        closing: true,
        routeKey: 'ExerciseSearch-9',
      }),
    ).toBe(false);
    expect(
      isClosingToTabsTransition(onActiveWorkout, {
        phase: 'start',
        closing: true,
        routeKey: 'ExerciseSearch-9',
      }),
    ).toBe(false);
  });

  it('is false when idle, opening, or not directly above Tabs', () => {
    expect(
      isClosingToTabsTransition(onActiveWorkout, {
        phase: 'idle',
        closing: false,
        routeKey: null,
      }),
    ).toBe(false);
    expect(
      isClosingToTabsTransition(onActiveWorkout, {
        phase: 'start',
        closing: false,
        routeKey: 'ActiveWorkout-1',
      }),
    ).toBe(false);
    expect(
      isClosingToTabsTransition(
        { tabsUnderTop: false, topRouteKey: 'ExerciseSearch-9' },
        { phase: 'start', closing: true, routeKey: 'ExerciseSearch-9' },
      ),
    ).toBe(false);
  });
});

describe('ActiveWorkoutBar localization', () => {
  beforeEach(() => {
    mockRestState.value = 'resting';
    mockExerciseName.value = null;
    jest.clearAllMocks();
    mockFlush.mockResolvedValue(false);
  });

  it.each([
    ['en', 'Next: Exercise — set 2/4', 'Open active workout', 'Pause', 'Skip rest'],
    ['pl', 'Następna seria: Ćwiczenie — 2/4', 'Otwórz aktywny trening', 'Wstrzymaj', 'Pomiń odpoczynek'],
  ] as const)('renders the %s next-set contract and callbacks', (locale, next, open, pause, skip) => {
    setTestLocale(locale);
    const { getByText, getByLabelText } = render(<ActiveWorkoutBar variant="embedded" />);
    expect(getByText(next)).toBeTruthy();
    expect(getByLabelText(open)).toBeTruthy();
    fireEvent.press(getByLabelText(pause));
    fireEvent.press(getByLabelText(skip));
    expect(mockPauseRest).toHaveBeenCalledTimes(1);
    expect(mockDismissRest).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['en', 'Next up: Bench Press — set 2/4', 'Done, start next set'],
    ['pl', 'Następna w kolejce: Bench Press — seria 2/4', 'Ukończ serię i rozpocznij następną'],
  ] as const)('keeps literal names in the %s ready state', (locale, next, done) => {
    setTestLocale(locale);
    mockExerciseName.value = 'Bench Press';
    mockRestState.value = 'ready';
    const { getByText, getByLabelText } = render(<ActiveWorkoutBar variant="embedded" />);
    expect(getByText(next)).toBeTruthy();
    fireEvent.press(getByLabelText(done));
    expect(mockCompleteActiveSet).toHaveBeenCalledTimes(1);
  });

  it('exposes clear and failed-save alerts with localized callbacks', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    setTestLocale('en');
    mockRestState.value = 'ready';
    const { getByLabelText } = render(<ActiveWorkoutBar variant="embedded" />);
    fireEvent.press(getByLabelText('Clear workout'));
    expect(alert).toHaveBeenCalledWith(
      'Clear workout?',
      'This will end the current workout without saving progress.',
      expect.any(Array),
    );
    const buttons = alert.mock.calls[0][2] ?? [];
    buttons[0]?.onPress?.();
    buttons[1]?.onPress?.();
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        'Could not save your workout',
        'Some changes have not reached the server.',
        expect.any(Array),
      ),
    );
    const failedSaveButtons = alert.mock.calls[1][2] ?? [];
    failedSaveButtons[1]?.onPress?.();
    expect(mockClearWorkout).toHaveBeenCalled();
    alert.mockRestore();
  });
});
