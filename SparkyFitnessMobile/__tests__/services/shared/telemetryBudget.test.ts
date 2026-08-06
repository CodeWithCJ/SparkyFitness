import {
  BACKGROUND_TELEMETRY_BUDGET,
  claimTelemetryBudget,
  isTelemetryInteractive,
  setTelemetryInteractive,
  setWorkoutTelemetryBudget,
} from '../../../src/services/shared/telemetryBudget';

// Module-scoped mutable state — restore both defaults before every test so
// order/pollution from other test files (backgroundSyncService.test.ts also
// touches this module) can't leak in.
beforeEach(() => {
  setWorkoutTelemetryBudget(Number.POSITIVE_INFINITY);
  setTelemetryInteractive(true);
});

describe('BACKGROUND_TELEMETRY_BUDGET', () => {
  it('is 3 — background runs enrich only the newest few workouts', () => {
    expect(BACKGROUND_TELEMETRY_BUDGET).toBe(3);
  });
});

describe('claimTelemetryBudget', () => {
  it('always claims successfully when the budget is unlimited (foreground default)', () => {
    for (let i = 0; i < 50; i++) {
      expect(claimTelemetryBudget()).toBe(true);
    }
  });

  it('claims exactly N times once capped, then rejects', () => {
    setWorkoutTelemetryBudget(3);

    expect(claimTelemetryBudget()).toBe(true);
    expect(claimTelemetryBudget()).toBe(true);
    expect(claimTelemetryBudget()).toBe(true);
    expect(claimTelemetryBudget()).toBe(false);
    // Stays rejected — it does not wrap or replenish on its own.
    expect(claimTelemetryBudget()).toBe(false);
  });

  it('rejects immediately when the budget is set to 0', () => {
    setWorkoutTelemetryBudget(0);
    expect(claimTelemetryBudget()).toBe(false);
  });

  it('treats a negative budget the same as exhausted', () => {
    // Defensive case: nothing in this codebase sets a negative budget today,
    // but claimTelemetryBudget's own `remaining <= 0` guard is what makes
    // that safe — pin the behavior so a future caller can rely on it.
    setWorkoutTelemetryBudget(-1);
    expect(claimTelemetryBudget()).toBe(false);
  });

  it('a skipped collection does not consume budget (only claiming does)', () => {
    setWorkoutTelemetryBudget(1);
    // Simulates a caller that checks something else first and never calls
    // claimTelemetryBudget for this workout — budget must still be there.
    expect(claimTelemetryBudget()).toBe(true);
    expect(claimTelemetryBudget()).toBe(false);
  });

  it('re-widening the budget after exhaustion allows claims again', () => {
    setWorkoutTelemetryBudget(1);
    expect(claimTelemetryBudget()).toBe(true);
    expect(claimTelemetryBudget()).toBe(false);

    // This is exactly what performBackgroundSync's finally block does after
    // a capped run finishes.
    setWorkoutTelemetryBudget(Number.POSITIVE_INFINITY);
    expect(claimTelemetryBudget()).toBe(true);
  });
});

describe('telemetry interactive flag', () => {
  it('defaults to true (foreground-safe)', () => {
    expect(isTelemetryInteractive()).toBe(true);
  });

  it('reflects the last value set, independent of the budget state', () => {
    setTelemetryInteractive(false);
    expect(isTelemetryInteractive()).toBe(false);

    // Exhausting the budget must not itself change interactivity — the two
    // are set together by callers (performBackgroundSyncInternal) but are
    // otherwise unrelated pieces of state.
    setWorkoutTelemetryBudget(0);
    claimTelemetryBudget();
    expect(isTelemetryInteractive()).toBe(false);

    setTelemetryInteractive(true);
    expect(isTelemetryInteractive()).toBe(true);
  });
});
