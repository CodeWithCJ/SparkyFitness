import {
  buildNutrientAverages,
  buildNutritionInsights,
  percentChange,
} from '../../src/utils/nutritionReport';
import type { NutritionTrendPoint } from '../../src/services/api/reportsApi';

const point = (
  date: string,
  calories: number,
  extra: Partial<NutritionTrendPoint> = {}
): NutritionTrendPoint =>
  ({
    date,
    calories,
    protein: 0,
    carbs: 0,
    fat: 0,
    dietary_fiber: 0,
    sugars: 0,
    sodium: 0,
    water_ml: 0,
    caffeine_mg: 0,
    alcohol_g: 0,
    ...extra,
  }) as NutritionTrendPoint;

describe('buildNutritionInsights', () => {
  it('leaves unlogged days out of averages and counts logged days', () => {
    const insights = buildNutritionInsights(
      [point('d1', 2000), point('d2', 0), point('d3', 1000)],
      [],
      [null, null, null]
    );
    expect(insights.loggedDays).toBe(2);
    expect(insights.averages?.calories).toBe(1500);
    expect(insights.highest).toEqual({ day: 'd1', calories: 2000 });
    expect(insights.lowest).toEqual({ day: 'd3', calories: 1000 });
  });

  it('splits macro calories 4/4/9 into shares that sum to 100', () => {
    const insights = buildNutritionInsights(
      [point('d1', 2000, { protein: 100, carbs: 200, fat: 50 })],
      [],
      [2000]
    );
    const split = insights.macroSplit!;
    expect(split.proteinPct + split.carbsPct + split.fatPct).toBeCloseTo(100);
    expect(Math.round(split.fatPct)).toBe(27);
  });

  it('classifies logged days against a ±10% goal band', () => {
    const insights = buildNutritionInsights(
      [point('d1', 2000), point('d2', 2500), point('d3', 1500), point('d4', 0)],
      [],
      [2000, 2000, 2000, 2000]
    );
    expect(insights.goal).toMatchObject({
      daysWithGoal: 3,
      onTarget: 1,
      over: 1,
      under: 1,
    });
    expect(insights.goal.averageDifference).toBeCloseTo(0);
  });

  it('takes the previous window average over its logged days', () => {
    const insights = buildNutritionInsights(
      [point('d1', 2000)],
      [point('p1', 1000), point('p2', 0), point('p3', 3000)],
      [null]
    );
    expect(insights.previousAverageCalories).toBe(2000);
  });
});

describe('percentChange', () => {
  it('rounds to whole percent and returns null without a baseline', () => {
    expect(percentChange(1100, 1000)).toBe(10);
    expect(percentChange(900, 1000)).toBe(-10);
    expect(percentChange(1000, null)).toBeNull();
    expect(percentChange(1000, 0)).toBeNull();
  });
});

describe('buildNutritionInsights extras', () => {
  it('averages calories per weekday over logged days only', () => {
    // 2026-10-05 and 2026-10-12 are Mondays; 2026-10-06 is a Tuesday.
    const insights = buildNutritionInsights(
      [
        point('2026-10-05', 2000),
        point('2026-10-06', 1500),
        point('2026-10-12', 1000),
        point('2026-10-13', 0),
      ],
      [],
      [null, null, null, null]
    );
    expect(insights.weekdayCalories).toEqual([
      { weekday: 1, average: 1500 },
      { weekday: 2, average: 1500 },
    ]);
  });

  it('counts logging streaks and does not break the current one on an empty last day', () => {
    const insights = buildNutritionInsights(
      [
        point('2026-10-01', 1),
        point('2026-10-02', 1),
        point('2026-10-03', 0),
        point('2026-10-04', 1),
        point('2026-10-05', 1),
        point('2026-10-06', 1),
        point('2026-10-07', 0),
      ],
      [],
      Array(7).fill(null)
    );
    expect(insights.streaks).toEqual({ current: 3, longest: 3 });
  });

  it('compares average macros with the average goal on logged days with a goal', () => {
    const insights = buildNutritionInsights(
      [
        point('d1', 2000, { protein: 100, carbs: 200, fat: 60 }),
        point('d2', 0),
        point('d3', 2000, { protein: 140, carbs: 240, fat: 80 }),
      ],
      [],
      [2000, 2000, 2000],
      {
        protein: [150, 150, 150],
        carbs: [null, null, null],
        fat: [70, 70, 70],
      }
    );
    expect(insights.macroGoals.map((m) => m.key)).toEqual(['protein', 'fat']);
    const protein = insights.macroGoals[0];
    expect(protein.average).toBe(120);
    expect(protein.goal).toBe(150);
    expect(protein.pct).toBe(80);
  });

  it('has no macro goal progress without goals', () => {
    expect(
      buildNutritionInsights([point('d1', 1)], [], [null]).macroGoals
    ).toEqual([]);
  });
});

describe('buildNutrientAverages', () => {
  const goals = [
    { sodium: 2300, custom_nutrients: { Creatine: 5 } },
    { sodium: 2300, custom_nutrients: { Creatine: 5 } },
  ] as never[];

  it('averages the chosen nutrients over logged days and leaves out ones never eaten', () => {
    const result = buildNutrientAverages(
      [
        point('d1', 2000, { sodium: 2000, potassium: 3000 }),
        point('d2', 0, { sodium: 9999 }),
      ],
      [],
      goals,
      ['sodium', 'iron', 'potassium']
    );
    expect(result.map((r) => r.key)).toEqual(['sodium', 'potassium']);
    expect(result[0].average).toBe(2000);
  });

  it('compares with the goal on logged days and the previous window', () => {
    const [sodium] = buildNutrientAverages(
      [
        point('d1', 2000, { sodium: 2300 }),
        point('d2', 1500, { sodium: 1150 }),
      ],
      [point('p1', 1800, { sodium: 1000 })],
      goals,
      ['sodium']
    );
    expect(sodium.average).toBe(1725);
    expect(sodium.goal).toBe(2300);
    expect(sodium.goalPct).toBe(75);
    expect(sodium.change).toBe(73);
  });

  it('reads custom nutrients by name, with their goal', () => {
    const [creatine] = buildNutrientAverages(
      [
        point('d1', 2000, { Creatine: 5 }),
        point('d2', 2000, { Creatine: 2.5 }),
      ],
      [],
      goals,
      ['Creatine']
    );
    expect(creatine.average).toBe(3.75);
    expect(creatine.goal).toBe(5);
    expect(creatine.goalPct).toBe(75);
  });

  it('uses the water goal for water', () => {
    const [water] = buildNutrientAverages(
      [point('d1', 2000, { water_ml: 1000 })],
      [],
      [{ water_goal_ml: 2000 }] as never[],
      ['water_ml']
    );
    expect(water.goalPct).toBe(50);
  });
});
