import type {
  WatchContextPayload,
  WatchGoalNutrientPayload,
} from '../../modules/watch-connectivity';
import { buildGarminSnapshot } from '../../src/utils/garminSnapshot';

const protein: WatchGoalNutrientPayload = {
  key: 'protein',
  label: 'Protein',
  unit: 'g',
  consumed: 82.4,
  goal: 140,
  progress: 82.4 / 140,
};

const context = (
  overrides: Partial<WatchContextPayload> = {}
): WatchContextPayload => ({
  pushedAt: 1_763_500_000_000,
  today: '2026-11-19',
  history: [],
  ackedClientIds: [],
  failedClientIds: [],
  energyUnit: 'kcal',
  workoutServerId: 'server-1',
  caloriesConsumed: 1234.4,
  caloriesBurned: 456.6,
  caloriesRemaining: 811.5,
  calorieGoalProgress: 0.6,
  goalNutrients: [protein],
  ...overrides,
});

/** Every value in the payload, however deep, for the no-null rule. */
const leafValues = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value.flatMap(leafValues);
  if (value !== null && typeof value === 'object') {
    return Object.values(value).flatMap(leafValues);
  }
  return [value];
};

describe('buildGarminSnapshot', () => {
  test('carries the push time, the phone day and the owner', () => {
    const snapshot = buildGarminSnapshot(context());

    expect(snapshot.pushedAt).toBe(1_763_500_000_000);
    expect(snapshot.today).toBe('2026-11-19');
    expect(snapshot.owner).toBe('server-1');
    expect(Object.keys(snapshot.topics)).toEqual(['goals']);
  });

  test('owner is an empty string with no active server', () => {
    expect(buildGarminSnapshot(context({ workoutServerId: null })).owner).toBe(
      ''
    );
    expect(
      buildGarminSnapshot(context({ workoutServerId: undefined })).owner
    ).toBe('');
  });

  test('builds the goals topic for today with rounded calories', () => {
    expect(buildGarminSnapshot(context()).topics.goals).toEqual({
      energyUnit: 'kcal',
      day: '2026-11-19',
      consumed: 1234,
      burned: 457,
      remaining: 812,
      progress: 0.6,
      nutrients: [
        {
          key: 'protein',
          label: 'Protein',
          unit: 'g',
          consumed: 82,
          goal: 140,
          progress: 82.4 / 140,
        },
      ],
    });
  });

  test('a stale day (calorie figures blanked) leaves only the energy unit', () => {
    const goals = buildGarminSnapshot(
      context({
        energyUnit: 'kJ',
        caloriesConsumed: null,
        caloriesBurned: null,
        caloriesRemaining: null,
        calorieGoalProgress: null,
        goalNutrients: null,
      })
    ).topics.goals;

    expect(goals).toEqual({ energyUnit: 'kJ' });
  });

  test('one missing or non-finite calorie figure is enough to drop the day', () => {
    for (const overrides of [
      { caloriesConsumed: undefined },
      { caloriesBurned: null },
      { caloriesRemaining: Number.NaN },
      { caloriesConsumed: Number.POSITIVE_INFINITY },
    ] satisfies Partial<WatchContextPayload>[]) {
      expect(buildGarminSnapshot(context(overrides)).topics.goals).toEqual({
        energyUnit: 'kcal',
      });
    }
  });

  test('a context day that is not YYYY-MM-DD is not vouched for', () => {
    expect(
      buildGarminSnapshot(context({ today: 'yesterday' })).topics.goals
    ).toEqual({ energyUnit: 'kcal' });
  });

  test('values stay kcal in a kJ account; only the unit is passed through', () => {
    const goals = buildGarminSnapshot(context({ energyUnit: 'kJ' })).topics
      .goals;

    expect(goals.energyUnit).toBe('kJ');
    expect(goals.consumed).toBe(1234);
    expect(goals.remaining).toBe(812);
  });

  test('a missing or unknown energy unit reads as kcal', () => {
    expect(
      buildGarminSnapshot(context({ energyUnit: null })).topics.goals.energyUnit
    ).toBe('kcal');
    expect(
      buildGarminSnapshot(context({ energyUnit: undefined })).topics.goals
        .energyUnit
    ).toBe('kcal');
  });

  test('remaining stays negative when over the goal', () => {
    const goals = buildGarminSnapshot(
      context({ caloriesRemaining: -250.6, calorieGoalProgress: 1 })
    ).topics.goals;

    expect(goals.remaining).toBe(-251);
    expect(goals.progress).toBe(1);
  });

  test('a small negative remaining rounds to 0, not -0', () => {
    const goals = buildGarminSnapshot(context({ caloriesRemaining: -0.3 }))
      .topics.goals;

    expect(Object.is(goals.remaining, 0)).toBe(true);
  });

  test('progress defaults to 0 and is kept inside 0...1', () => {
    expect(
      buildGarminSnapshot(context({ calorieGoalProgress: null })).topics.goals
        .progress
    ).toBe(0);
    expect(
      buildGarminSnapshot(context({ calorieGoalProgress: undefined })).topics
        .goals.progress
    ).toBe(0);
    expect(
      buildGarminSnapshot(context({ calorieGoalProgress: 1.4 })).topics.goals
        .progress
    ).toBe(1);
    expect(
      buildGarminSnapshot(context({ calorieGoalProgress: -0.2 })).topics.goals
        .progress
    ).toBe(0);
  });

  test('nutrients keep the phone order and round amount and goal', () => {
    const goals = buildGarminSnapshot(
      context({
        goalNutrients: [
          { ...protein, key: 'fat', label: 'Fat', consumed: 40.5, goal: 70.5 },
          {
            key: 'Creatine',
            label: 'Creatine',
            unit: 'g',
            consumed: 4.6,
            goal: 5,
            progress: 0.92,
          },
        ],
      })
    ).topics.goals;

    expect(goals.nutrients?.map((row) => row.key)).toEqual(['fat', 'Creatine']);
    expect(goals.nutrients?.[0]).toMatchObject({ consumed: 41, goal: 71 });
    expect(goals.nutrients?.[1]).toMatchObject({
      consumed: 5,
      goal: 5,
      progress: 0.92,
    });
  });

  test('a nutrient without a goal has no goal key and progress 0', () => {
    const rows: WatchGoalNutrientPayload[] = [
      { ...protein, key: 'sodium', goal: null, progress: 0 },
      { ...protein, key: 'sugars', goal: 0, progress: 0.5 },
      { ...protein, key: 'iron', goal: 0.4, progress: 0.8 },
      { ...protein, key: 'fiber', goal: -10, progress: 0.3 },
    ];
    const nutrients =
      buildGarminSnapshot(context({ goalNutrients: rows })).topics.goals
        .nutrients ?? [];

    expect(nutrients).toHaveLength(4);
    for (const row of nutrients) {
      expect('goal' in row).toBe(false);
      expect(row.progress).toBe(0);
    }
  });

  test('nutrient progress is kept inside 0...1', () => {
    const nutrients =
      buildGarminSnapshot(
        context({ goalNutrients: [{ ...protein, progress: 3 }] })
      ).topics.goals.nutrients ?? [];

    expect(nutrients[0].progress).toBe(1);
  });

  test('nutrients is an empty array when the phone sends none', () => {
    expect(
      buildGarminSnapshot(context({ goalNutrients: null })).topics.goals
        .nutrients
    ).toEqual([]);
    expect(
      buildGarminSnapshot(context({ goalNutrients: undefined })).topics.goals
        .nutrients
    ).toEqual([]);
    expect(
      buildGarminSnapshot(context({ goalNutrients: [] })).topics.goals.nutrients
    ).toEqual([]);
  });

  test('a nutrient row without an amount is skipped', () => {
    const broken = {
      ...protein,
      key: 'carbs',
      consumed: Number.NaN,
    };
    const nutrients =
      buildGarminSnapshot(context({ goalNutrients: [broken, protein] })).topics
        .goals.nutrients ?? [];

    expect(nutrients.map((row) => row.key)).toEqual(['protein']);
  });

  test('never carries null or undefined, in any shape', () => {
    const shapes = [
      context(),
      context({
        caloriesConsumed: null,
        caloriesBurned: null,
        caloriesRemaining: null,
        goalNutrients: null,
        workoutServerId: null,
        energyUnit: null,
      }),
      context({
        calorieGoalProgress: undefined,
        goalNutrients: [{ ...protein, goal: null }],
      }),
    ];
    for (const shape of shapes) {
      const values = leafValues(buildGarminSnapshot(shape));
      expect(values).not.toContain(null);
      expect(values).not.toContain(undefined);
    }
  });

  test('does not read the clock: the same context gives the same snapshot', () => {
    const input = context();
    expect(buildGarminSnapshot(input)).toEqual(buildGarminSnapshot(input));
  });
});
