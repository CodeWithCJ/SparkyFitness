import React from 'react';
import { fireEvent, render, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ActiveWorkoutScreen from '../../src/screens/ActiveWorkoutScreen';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
import { __resetAppPreferencesStoreForTests } from '../../src/stores/appPreferencesStore';
import type { ActionSheetItem } from '../../src/components/ActionSheet';
import type { PresetSessionResponse } from '@workspace/shared';

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(() => ({ preferences: null })),
}));

jest.mock('../../src/hooks/useExerciseImageSource', () => ({
  useExerciseImageSource: jest.fn(() => ({ getImageSource: jest.fn(() => null) })),
}));

// The real hook imports the workout update API and the screen destructures
// { flush } from it — left unmocked it would fire network on blur/finish.
jest.mock('../../src/hooks/useActiveWorkoutAutosave', () => ({
  useActiveWorkoutAutosave: jest.fn(() => ({ flush: jest.fn(async () => true) })),
}));

jest.mock('../../src/hooks/useSelectedExercise', () => ({
  useSelectedExercise: jest.fn(),
}));

jest.mock('../../src/hooks/useNavigationActionGuard', () => ({
  useNavigationActionGuard: jest.fn(() => ({
    runNavigationAction: jest.fn((action: () => void) => action()),
  })),
}));

// Keep the real useSupersetBorders (the overflow menu's candidate logic
// depends on it); only the rail's rendering is stubbed out.
jest.mock('../../src/components/ActiveWorkoutRail', () => {
  const actual = jest.requireActual('../../src/components/ActiveWorkoutRail');
  return { __esModule: true, ...actual, default: () => null };
});

jest.mock('../../src/components/ActiveWorkoutHeader', () => {
  const React = require('react');
  const { View } = require('react-native');
  const actual = jest.requireActual('../../src/components/ActiveWorkoutHeader');
  return {
    __esModule: true,
    buildExerciseProgress: actual.buildExerciseProgress,
    default: () => <View testID="header" />,
  };
});

// Trigger pressables standing in for each card, driving the screen's wiring.
jest.mock('../../src/components/ActiveWorkoutExerciseCard', () => {
  const React = require('react');
  const { View, Pressable } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => (
      <View testID={`card-${props.exercise.id}`}>
        <Pressable
          testID={`card-${props.exercise.id}-overflow`}
          onPress={() => props.onPressOverflow?.(props.exercise.id)}
        />
      </View>
    ),
  };
});

jest.mock('../../src/components/RestPeriodSheet', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((_props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return null;
    }),
  };
});

jest.mock('../../src/components/WorkoutReorderList', () => ({
  __esModule: true,
  default: () => null,
}));

// Captures the sheet's props each render and exposes present/dismiss spies,
// so tests can assert the imperative wiring and drive owner callbacks
// (onBack/onDismiss) directly. The present-lifecycle behavior itself is
// regression-tested in ActionSheet.test.tsx.
const mockSheet: {
  present: jest.Mock;
  dismiss: jest.Mock;
  props: {
    title: string;
    items: ActionSheetItem[];
    onBack?: () => void;
    onDismiss?: () => void;
  } | null;
} = { present: jest.fn(), dismiss: jest.fn(), props: null };

jest.mock('../../src/components/ActionSheet', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((props: any, ref: any) => {
      React.useEffect(() => {
        mockSheet.props = props;
      });
      React.useImperativeHandle(ref, () => ({
        present: mockSheet.present,
        dismiss: mockSheet.dismiss,
      }));
      return null;
    }),
  };
});

function makeSet(id: number, overrides?: Record<string, unknown>) {
  return {
    id,
    set_number: 1,
    set_type: 'normal',
    reps: 10,
    weight: 60,
    duration: null,
    rest_time: 90,
    notes: null,
    rpe: null,
    completed_at: null,
    ...overrides,
  };
}

function makeExercise(id: string, name: string, sets: ReturnType<typeof makeSet>[]) {
  return {
    id,
    exercise_id: `x-${id}`,
    duration_minutes: 20,
    calories_burned: 150,
    entry_date: '2026-07-01',
    notes: null,
    distance: null,
    avg_heart_rate: null,
    source: null,
    superset_group: null,
    exercise_snapshot: {
      id: `x-${id}`,
      name,
      category: 'Strength',
      images: [],
      calories_per_hour: 400,
    },
    activity_details: [],
    sets,
  } as any;
}

function makeSession(): PresetSessionResponse {
  return {
    type: 'preset',
    id: 'session-1',
    entry_date: '2026-07-01',
    workout_preset_id: null,
    name: 'Push Day',
    description: null,
    notes: null,
    source: 'sparky',
    total_duration_minutes: 60,
    activity_details: [],
    exercises: [
      // Exercise A carries a server-completed set so the Clear conditional
      // is on for A only.
      makeExercise('ex-a', 'Bench Press', [
        makeSet(101, { completed_at: '2026-07-01T10:00:00.000Z' }),
        makeSet(102, { set_number: 2 }),
      ]),
      makeExercise('ex-b', 'Squat', [makeSet(201)]),
      makeExercise('ex-c', 'Deadlift', [makeSet(301)]),
    ],
  };
}

const navigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  canGoBack: jest.fn(() => true),
  addListener: jest.fn(() => jest.fn()),
} as any;
const route = { key: 'ActiveWorkout-1', name: 'ActiveWorkout', params: undefined } as any;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <QueryClientProvider client={queryClient}>
        <ActiveWorkoutScreen navigation={navigation} route={route} />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

function sheetItemKeys(): string[] {
  return (mockSheet.props?.items ?? []).map((item) => item.key);
}

function pressSheetItem(key: string) {
  const item = mockSheet.props?.items.find((i) => i.key === key);
  expect(item).toBeDefined();
  act(() => item!.onPress());
}

describe('ActiveWorkoutScreen overflow menu wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The screen's 1s elapsed tick would otherwise fire outside act().
    jest.useFakeTimers();
    __resetActiveWorkoutStoreForTests();
    __resetAppPreferencesStoreForTests();
    mockSheet.props = null;
    useActiveWorkoutStore.getState().startWorkout(makeSession());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('presents the sheet titled with the exercise name and the expected items', () => {
    const { getByTestId } = renderScreen();

    fireEvent.press(getByTestId('card-ex-a-overflow'));

    expect(mockSheet.present).toHaveBeenCalledTimes(1);
    expect(mockSheet.props?.title).toBe('Bench Press');
    expect(mockSheet.props?.onBack).toBeUndefined();
    expect(sheetItemKeys()).toEqual([
      'view',
      'notes',
      'superset-with',
      'replace',
      'clear',
      'remove',
    ]);
    const remove = mockSheet.props?.items.find((i) => i.key === 'remove');
    expect(remove?.destructive).toBe(true);
  });

  it('offers Clear logged sets only for exercises with a completed set', () => {
    const { getByTestId } = renderScreen();

    fireEvent.press(getByTestId('card-ex-b-overflow'));

    expect(mockSheet.props?.title).toBe('Squat');
    expect(sheetItemKeys()).not.toContain('clear');
  });

  it('swaps to the candidate pick list in place and back', () => {
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('card-ex-a-overflow'));

    const pick = mockSheet.props?.items.find((i) => i.key === 'superset-with');
    expect(pick?.dismissOnPress).toBe(false);
    pressSheetItem('superset-with');

    expect(mockSheet.props?.title).toBe('Superset with…');
    expect(sheetItemKeys()).toEqual(['ex-b', 'ex-c']);
    expect(mockSheet.props?.items.map((i) => i.label)).toEqual(['Squat', 'Deadlift']);
    expect(mockSheet.props?.onBack).toBeDefined();

    act(() => mockSheet.props?.onBack?.());
    expect(mockSheet.props?.title).toBe('Bench Press');
    expect(sheetItemKeys()).toContain('superset-with');
    expect(mockSheet.props?.onBack).toBeUndefined();
  });

  it('groups the picked candidate into a superset', () => {
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('card-ex-a-overflow'));
    pressSheetItem('superset-with');

    pressSheetItem('ex-c');

    const exercises = useActiveWorkoutStore.getState().session?.exercises ?? [];
    const a = exercises.find((e) => e.id === 'ex-a');
    const c = exercises.find((e) => e.id === 'ex-c');
    expect(a?.superset_group).not.toBeNull();
    expect(a?.superset_group).toBe(c?.superset_group);
  });

  it('clears menu state on dismiss and presents fresh for the next card', () => {
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('card-ex-a-overflow'));
    expect(sheetItemKeys().length).toBeGreaterThan(0);

    act(() => mockSheet.props?.onDismiss?.());
    expect(sheetItemKeys()).toEqual([]);

    fireEvent.press(getByTestId('card-ex-b-overflow'));
    expect(mockSheet.present).toHaveBeenCalledTimes(2);
    expect(mockSheet.props?.title).toBe('Squat');
  });
});
