import {
  buildWarmupDrafts,
  hasLoggedWarmup,
} from '../../src/utils/warmupDrafts';
import { resolveWarmupOptions } from '../../src/utils/warmupSettings';

const prefs = {
  warmupCalculatorEnabled: true,
  warmupMethod: [
    { percent: 40, reps: 5 },
    { percent: 60, reps: 5 },
    { percent: 80, reps: 3 },
  ],
  warmupPlateRounding: { kg: 2.5, lbs: 5 },
  warmupDumbbellRounding: { kg: 1, lbs: 2 },
};

const card = (
  weightKg: number | null,
  snapshot: Record<string, unknown> | null = { modality: 'weight_reps' }
) =>
  ({
    sets: [{ id: 's1', set_type: null, weight: weightKg, reps: 5 }],
    exercise_snapshot: snapshot,
  }) as never;

describe('buildWarmupDrafts', () => {
  it('builds the ramp from the first working set, as display-unit text', () => {
    expect(buildWarmupDrafts(card(100), 'kg', prefs)).toEqual([
      { weight: '40.0', reps: '5' },
      { weight: '60.0', reps: '5' },
      { weight: '80.0', reps: '3' },
    ]);
  });

  it('works in pounds', () => {
    // 225 lb (102.06 kg) at a 5 lb step: 90, 135, 180
    const drafts = buildWarmupDrafts(card(225 * 0.45359237), 'lbs', prefs);
    expect(drafts.map((d) => d.weight)).toEqual(['90.0', '135.0', '180.0']);
  });

  it("follows the lifter's method", () => {
    const drafts = buildWarmupDrafts(card(100), 'kg', {
      ...prefs,
      warmupMethod: [
        { percent: 50, reps: 8 },
        { percent: 75, reps: 2 },
      ],
    });
    expect(drafts).toEqual([
      { weight: '50.0', reps: '8' },
      { weight: '75.0', reps: '2' },
    ]);
  });

  it('rounds a dumbbell exercise to the dumbbell step', () => {
    // 30 kg at 1 kg steps: 12, 18, 24. At the 2.5 plate step it would be
    // 12.5, 17.5, 25.
    const withDumbbells = card(30, {
      modality: 'weight_reps',
      equipment: ['Dumbbell'],
    });
    expect(
      buildWarmupDrafts(withDumbbells, 'kg', prefs).map((d) => d.weight)
    ).toEqual(['12.0', '18.0', '24.0']);
    expect(
      buildWarmupDrafts(card(30), 'kg', prefs).map((d) => d.weight)
    ).toEqual(['12.5', '17.5', '25.0']);
  });

  it('gives nothing when the calculator is off, there is no weight, or it is not a weight lift', () => {
    expect(
      buildWarmupDrafts(card(100), 'kg', {
        ...prefs,
        warmupCalculatorEnabled: false,
      })
    ).toEqual([]);
    expect(buildWarmupDrafts(card(null), 'kg', prefs)).toEqual([]);
    expect(
      buildWarmupDrafts(card(100, { modality: 'duration' }), 'kg', prefs)
    ).toEqual([]);
  });
});

describe('hasLoggedWarmup', () => {
  it('is true only for a logged warm-up', () => {
    expect(
      hasLoggedWarmup([{ setType: 'warmup', completedAt: '2026-10-06' }])
    ).toBe(true);
    expect(hasLoggedWarmup([{ setType: 'warmup', completedAt: null }])).toBe(
      false
    );
    expect(
      hasLoggedWarmup([{ setType: 'normal', completedAt: '2026-10-06' }])
    ).toBe(false);
  });
});

describe('resolveWarmupOptions', () => {
  it('picks the dumbbell or plate step for the unit', () => {
    expect(resolveWarmupOptions(prefs, 'lbs', ['dumbbell']).increment).toBe(2);
    expect(resolveWarmupOptions(prefs, 'lbs', ['barbell']).increment).toBe(5);
    expect(resolveWarmupOptions(prefs, 'kg', null).increment).toBe(2.5);
  });

  it('falls back to the defaults for a missing or unusable setting', () => {
    const options = resolveWarmupOptions(
      {
        ...prefs,
        warmupMethod: [],
        warmupPlateRounding: { kg: 0, lbs: 5 },
      },
      'kg',
      null
    );
    expect(options.increment).toBe(2.5);
    expect(options.method).toEqual([
      { percent: 40, reps: 5 },
      { percent: 60, reps: 5 },
      { percent: 80, reps: 3 },
    ]);
  });
});
