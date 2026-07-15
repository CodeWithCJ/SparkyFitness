import { isClosingToTabsTransition } from '../../src/components/ActiveWorkoutBar';

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
