import { renderHook } from '@testing-library/react-native';

import {
  ACTIVE_WORKOUT_BAR_HEIGHT,
  isClosingToTabsTransition,
  shouldSuppressActiveWorkoutBar,
  useActiveWorkoutBarPadding,
} from '../../src/components/ActiveWorkoutBar';
import { useHasGpsRecording } from '../../src/services/gpsRecordingService';
import { useActiveWorkoutStore } from '../../src/stores/activeWorkoutStore';

jest.mock('../../src/services/gpsRecordingService', () => ({
  useGpsRecording: jest.fn(() => ({ session: null, points: [] })),
  useHasGpsRecording: jest.fn(() => false),
}));

describe('useActiveWorkoutBarPadding', () => {
  beforeEach(() => {
    jest.mocked(useHasGpsRecording).mockReturnValue(false);
    useActiveWorkoutStore.setState({ sessionId: null });
  });

  it('reserves nothing when there is no workout and no recording', () => {
    expect(renderHook(() => useActiveWorkoutBarPadding()).result.current).toBe(
      0
    );
  });

  it('reserves room for a GPS recording the bar is showing', () => {
    jest.mocked(useHasGpsRecording).mockReturnValue(true);

    expect(renderHook(() => useActiveWorkoutBarPadding()).result.current).toBe(
      ACTIVE_WORKOUT_BAR_HEIGHT
    );
  });

  it('reserves room for a strength workout', () => {
    useActiveWorkoutStore.setState({ sessionId: 42 });

    expect(renderHook(() => useActiveWorkoutBarPadding()).result.current).toBe(
      ACTIVE_WORKOUT_BAR_HEIGHT
    );
  });
});

describe('shouldSuppressActiveWorkoutBar', () => {
  it('keeps the HUD off meal-plan routes with sticky bottom actions', () => {
    expect(shouldSuppressActiveWorkoutBar('MealPlans')).toBe(true);
    expect(shouldSuppressActiveWorkoutBar('MealPlanForm')).toBe(true);
  });

  // Regression: the floating HUD collided with these screens' sticky
  // FooterSaveBar/FooterActionBar, covering the Save/Add button (#2245).
  it('keeps the HUD off other routes with sticky bottom actions', () => {
    expect(shouldSuppressActiveWorkoutBar('MealAdd')).toBe(true);
    expect(shouldSuppressActiveWorkoutBar('CycleLogModal')).toBe(true);
    expect(shouldSuppressActiveWorkoutBar('WaterContainerEdit')).toBe(true);
    expect(shouldSuppressActiveWorkoutBar('WaterContainers')).toBe(true);
  });
});

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
      })
    ).toBe(true);
    expect(
      isClosingToTabsTransition(onActiveWorkout, {
        phase: 'end',
        closing: true,
        routeKey: 'ActiveWorkout-1',
      })
    ).toBe(true);
  });

  it('trusts a transition with no route key', () => {
    expect(
      isClosingToTabsTransition(onActiveWorkout, {
        phase: 'start',
        closing: true,
        routeKey: null,
      })
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
      })
    ).toBe(false);
    expect(
      isClosingToTabsTransition(onActiveWorkout, {
        phase: 'start',
        closing: true,
        routeKey: 'ExerciseSearch-9',
      })
    ).toBe(false);
  });

  it('is false when idle, opening, or not directly above Tabs', () => {
    expect(
      isClosingToTabsTransition(onActiveWorkout, {
        phase: 'idle',
        closing: false,
        routeKey: null,
      })
    ).toBe(false);
    expect(
      isClosingToTabsTransition(onActiveWorkout, {
        phase: 'start',
        closing: false,
        routeKey: 'ActiveWorkout-1',
      })
    ).toBe(false);
    expect(
      isClosingToTabsTransition(
        { tabsUnderTop: false, topRouteKey: 'ExerciseSearch-9' },
        { phase: 'start', closing: true, routeKey: 'ExerciseSearch-9' }
      )
    ).toBe(false);
  });
});
