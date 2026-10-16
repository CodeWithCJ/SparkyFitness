import {
  applyHeartRateTargets,
  HEART_RATE_ALERT_REPEAT_MS,
  HEART_RATE_ALERT_SUSTAIN_MS,
  INITIAL_HEART_RATE_ALERT_STATE,
  isValidIntervalPlan,
  normalizeHeartRateBand,
  stepHeartRateAlert,
  type HeartRateAlertState,
} from '@workspace/shared';

const band = { minBpm: 140, maxBpm: 160 };

const run = (readings: [number, number | null][]) => {
  let state: HeartRateAlertState = INITIAL_HEART_RATE_ALERT_STATE;
  const alerts: (string | null)[] = [];
  for (const [at, bpm] of readings) {
    const next = stepHeartRateAlert(state, bpm, band, at);
    state = next.state;
    alerts.push(next.alert);
  }
  return alerts;
};

describe('normalizeHeartRateBand', () => {
  test('accepts a sensible range', () => {
    expect(normalizeHeartRateBand({ minBpm: 140.4, maxBpm: 160 })).toEqual({
      minBpm: 140,
      maxBpm: 160,
    });
  });

  test.each([
    [null],
    [{ minBpm: 160, maxBpm: 140 }],
    [{ minBpm: 140, maxBpm: 145 }],
    [{ minBpm: 20, maxBpm: 100 }],
    [{ minBpm: 100, maxBpm: 250 }],
    [{ minBpm: NaN, maxBpm: 150 }],
  ])('rejects %j', (value) => {
    expect(normalizeHeartRateBand(value)).toBeNull();
  });
});

describe('stepHeartRateAlert', () => {
  test('stays quiet inside the range and within two bpm of an edge', () => {
    expect(
      run([
        [0, 150],
        [20_000, 162],
        [40_000, 138],
      ])
    ).toEqual([null, null, null]);
  });

  test('waits longer than the pace alert before the first alert', () => {
    expect(
      run([
        [0, 175],
        [HEART_RATE_ALERT_SUSTAIN_MS - 1, 175],
        [HEART_RATE_ALERT_SUSTAIN_MS, 175],
      ])
    ).toEqual([null, null, 'tooHigh']);
  });

  test('a return to the range cancels the wait', () => {
    expect(
      run([
        [0, 175],
        [10_000, 150],
        [14_000, 175],
        [HEART_RATE_ALERT_SUSTAIN_MS + 5_000, 175],
      ])
    ).toEqual([null, null, null, null]);
  });

  test('repeats no more than every 45 seconds while it stays outside', () => {
    const t0 = HEART_RATE_ALERT_SUSTAIN_MS;
    expect(
      run([
        [0, 120],
        [t0, 120],
        [t0 + 20_000, 120],
        [t0 + HEART_RATE_ALERT_REPEAT_MS - 1, 120],
        [t0 + HEART_RATE_ALERT_REPEAT_MS, 120],
      ])
    ).toEqual([null, 'tooLow', null, null, 'tooLow']);
  });

  test('crossing to the other side waits again', () => {
    expect(
      run([
        [0, 120],
        [HEART_RATE_ALERT_SUSTAIN_MS, 120],
        [HEART_RATE_ALERT_SUSTAIN_MS + 1_000, 175],
        [HEART_RATE_ALERT_SUSTAIN_MS * 2 + 1_000, 175],
      ])
    ).toEqual([null, 'tooLow', null, 'tooHigh']);
  });

  test('a missing reading changes nothing', () => {
    const start: HeartRateAlertState = {
      side: 'tooHigh',
      outsideSince: 0,
      lastAlertAt: null,
    };
    expect(stepHeartRateAlert(start, null, band, 60_000)).toEqual({
      state: start,
      alert: null,
    });
  });
});

describe('applyHeartRateTargets', () => {
  const plan = {
    style: 'fastEasy' as const,
    steps: [
      { kind: 'warmup' as const, seconds: 300 },
      { kind: 'work' as const, seconds: 180 },
      { kind: 'recovery' as const, seconds: 120 },
    ],
  };
  const fast = { minBpm: 160, maxBpm: 175 };
  const easy = { minBpm: 120, maxBpm: 140 };

  it('sets the ranges on work and recovery steps only', () => {
    const result = applyHeartRateTargets(plan, { work: fast, easy });
    expect(result.steps.map((step) => step.heartRate)).toEqual([
      undefined,
      fast,
      easy,
    ]);
    expect(isValidIntervalPlan(result)).toBe(true);
  });

  it('puts the warm-up range on the warm-up and cool-down', () => {
    const warm = { minBpm: 100, maxBpm: 125 };
    const withCooldown = {
      ...plan,
      steps: [...plan.steps, { kind: 'cooldown' as const, seconds: 300 }],
    };
    const result = applyHeartRateTargets(withCooldown, {
      work: fast,
      easy,
      warm,
    });
    expect(result.steps.map((step) => step.heartRate)).toEqual([
      warm,
      fast,
      easy,
      warm,
    ]);
    expect(isValidIntervalPlan(result)).toBe(true);
  });

  it('ignores an unusable range and rejects a plan carrying one', () => {
    expect(
      applyHeartRateTargets(plan, { work: { minBpm: 150, maxBpm: 152 } })
    ).toBe(plan);
    expect(
      isValidIntervalPlan({
        ...plan,
        steps: [{ ...plan.steps[0], heartRate: { minBpm: 5, maxBpm: 6 } }],
      })
    ).toBe(false);
  });
});
