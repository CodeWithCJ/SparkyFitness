import {
  BACKGROUND_TELEMETRY_BUDGET,
  FOREGROUND_TELEMETRY_BUDGET,
  createTelemetryRunContext,
} from '../../../src/services/shared/telemetryBudget';

describe('BACKGROUND_TELEMETRY_BUDGET', () => {
  it('is 3 — background runs enrich only the newest few workouts', () => {
    expect(BACKGROUND_TELEMETRY_BUDGET).toBe(3);
  });
});

describe('FOREGROUND_TELEMETRY_BUDGET', () => {
  it('is finite — an unbounded foreground run is what caused #2191', () => {
    expect(Number.isFinite(FOREGROUND_TELEMETRY_BUDGET)).toBe(true);
  });

  it('is more generous than the background budget but still capped', () => {
    expect(FOREGROUND_TELEMETRY_BUDGET).toBeGreaterThan(BACKGROUND_TELEMETRY_BUDGET);
  });
});

describe('createTelemetryRunContext', () => {
  it('defaults to unlimited budget and interactive (the foreground shape)', () => {
    const ctx = createTelemetryRunContext();
    expect(ctx.interactive).toBe(true);
    for (let i = 0; i < 50; i++) {
      expect(ctx.claim()).toBe(true);
    }
  });

  it('claims exactly N times once capped, then rejects', () => {
    const ctx = createTelemetryRunContext({ budget: 3 });

    expect(ctx.claim()).toBe(true);
    expect(ctx.claim()).toBe(true);
    expect(ctx.claim()).toBe(true);
    expect(ctx.claim()).toBe(false);
    // Stays rejected — it does not wrap or replenish on its own.
    expect(ctx.claim()).toBe(false);
  });

  it('rejects immediately when the budget is 0', () => {
    const ctx = createTelemetryRunContext({ budget: 0 });
    expect(ctx.claim()).toBe(false);
  });

  it('treats a negative budget the same as exhausted', () => {
    // Defensive case: nothing in this codebase passes a negative budget today,
    // but claim's own `remaining <= 0` guard is what makes that safe — pin the
    // behavior so a future caller can rely on it.
    const ctx = createTelemetryRunContext({ budget: -1 });
    expect(ctx.claim()).toBe(false);
  });

  it('keeps budgets independent across contexts', () => {
    // Concurrent runs each carry their own context; a capped background run
    // draining its budget must not consume a foreground run's.
    const capped = createTelemetryRunContext({ budget: 1, interactive: false });
    const foreground = createTelemetryRunContext();

    expect(capped.claim()).toBe(true);
    expect(capped.claim()).toBe(false);
    expect(foreground.claim()).toBe(true);
    expect(foreground.interactive).toBe(true);
    expect(capped.interactive).toBe(false);
  });

  it('exhausting the budget does not change interactivity', () => {
    const ctx = createTelemetryRunContext({ budget: 0, interactive: true });
    expect(ctx.claim()).toBe(false);
    expect(ctx.interactive).toBe(true);
  });
});

describe('collected-session staging is run-scoped (PR #2218 review)', () => {
  it('does not leak staged keys between overlapping runs', () => {
    // Background tasks, manual syncs and the iOS observer path are not mutually
    // exclusive. With one shared staging area, a successful upload in run B
    // would commit keys staged by run A — marking A's sessions collected even
    // though the server never received their telemetry.
    const runA = createTelemetryRunContext();
    const runB = createTelemetryRunContext();

    runA.stageCollected('session-a');
    runB.stageCollected('session-b');

    expect(runB.drainCollected()).toEqual(['session-b']);
    expect(runA.drainCollected()).toEqual(['session-a']);
  });

  it('drains once — a second drain returns nothing', () => {
    const ctx = createTelemetryRunContext();
    ctx.stageCollected('session-a');

    expect(ctx.drainCollected()).toEqual(['session-a']);
    expect(ctx.drainCollected()).toEqual([]);
  });

  it('ignores sessions with no stable identity', () => {
    const ctx = createTelemetryRunContext();
    ctx.stageCollected(null);

    expect(ctx.drainCollected()).toEqual([]);
  });

  it('an abandoned run takes its staging with it', () => {
    // A run whose upload failed is never drained; its keys die with the
    // context rather than being committed by someone else's success.
    const failed = createTelemetryRunContext();
    failed.stageCollected('never-uploaded');

    const next = createTelemetryRunContext();
    expect(next.drainCollected()).toEqual([]);
  });
});
