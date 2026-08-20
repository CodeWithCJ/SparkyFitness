import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_SUPPLEMENT_TOTALS,
  FOOD_VARIANT_NUTRIENT_FIELDS,
} from '@workspace/shared';
import {
  createMockDbClient,
  type MockDbClient,
} from './helpers/mockDbClient.js';
import { v4 as uuidv4 } from 'uuid';
import { getClient } from '../db/poolManager.js';
import {
  getDailyNutritionSummary,
  getDailyNutritionSummariesByDates,
  getDailySupplementTotals,
} from '../models/foodMisc.js';
import { getDailyNutritionTotalsRange } from '../models/reportRepository.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

// The diary goal comparison and the trends range each aggregate daily nutrient totals
// independently, so the supplement snapshot has to be wired into every one of them (not just
// the Reports > Nutrients query) or supplements would not count toward goals in the diary.
describe('daily-total aggregations include supplement snapshots', () => {
  let mockClient: MockDbClient;
  const userId = uuidv4();

  beforeEach(() => {
    mockClient = createMockDbClient([{}]);
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => vi.clearAllMocks());

  const sqlOf = () => String(mockClient.query.mock.calls[0][0]);
  const expectSupplementArm = (sql: string) => {
    // Reads the immutable per-entry snapshot, restricted to taken/prn_taken entries, and
    // scales by the dose count (GREATEST-clamped so a non-positive value can't subtract).
    expect(sql).toContain('medication_entries');
    expect(sql).toMatch(/\w+\.status IN \('taken', 'prn_taken'\)/);
    expect(sql).toMatch(
      /GREATEST\(COALESCE\(\w+\.dose_amount_snapshot, 1\), 0\)/
    );
    // Both the fixed macros and the custom-nutrient aggregation pull from the snapshot.
    expect(sql).toContain("nutrients_snapshot->>'calories'");
    expect(sql).toContain("nutrients_snapshot->'custom_nutrients'");
  };

  // A day on which the user logged only supplements must still produce a row. Both
  // queries therefore drive from the UNION of food and taken-supplement dates rather
  // than letting food_entries select the date set.
  const expectUnionDrivenDates = (sql: string) => {
    expect(sql).toContain('UNION');
    expect(sql).toContain('FROM medication_entries');
    expect(sql).toContain('LEFT JOIN food_entries');
  };

  it('groups by the union of food and supplement dates', async () => {
    await getDailyNutritionSummariesByDates(userId, ['2026-07-21']);
    expectUnionDrivenDates(sqlOf());
  });

  it('ranges over the union of food and supplement dates', async () => {
    await getDailyNutritionTotalsRange(userId, '2026-07-01', '2026-07-21');
    expectUnionDrivenDates(sqlOf());
  });

  it('getDailyNutritionSummary adds the supplement arm', async () => {
    await getDailyNutritionSummary(userId, '2026-07-21');
    expectSupplementArm(sqlOf());
  });

  it('getDailyNutritionSummariesByDates adds the supplement arm', async () => {
    await getDailyNutritionSummariesByDates(userId, ['2026-07-21']);
    expectSupplementArm(sqlOf());
  });

  it('getDailyNutritionTotalsRange adds the supplement arm (fixed columns)', async () => {
    await getDailyNutritionTotalsRange(userId, '2026-07-01', '2026-07-21');
    const sql = sqlOf();
    expect(sql).toContain('medication_entries');
    expect(sql).toContain("nutrients_snapshot->>'calories'");
    expect(sql).toMatch(
      /GREATEST\(COALESCE\(\w+\.dose_amount_snapshot, 1\), 0\)/
    );
  });
});

// The Diary needs the supplement arm on its own, because it computes eaten calories and
// its nutrition summary in JS from food entries rather than from the SQL above.
describe('getDailySupplementTotals', () => {
  let mockClient: MockDbClient;
  const userId = uuidv4();

  afterEach(() => vi.clearAllMocks());

  it('reads the same snapshot arm as the other aggregations', async () => {
    mockClient = createMockDbClient([{}]);
    vi.mocked(getClient).mockResolvedValue(mockClient);

    await getDailySupplementTotals(userId, '2026-08-06');

    const sql = String(mockClient.query.mock.calls[0][0]);
    expect(sql).toMatch(/\w+\.status IN \('taken', 'prn_taken'\)/);
    expect(sql).toMatch(
      /GREATEST\(COALESCE\(\w+\.dose_amount_snapshot, 1\), 0\)/
    );
    // Exactly the fields the nutrition summary sums for supplements. Offering the picker
    // a field this query does not read would let a user enter a number that goes nowhere.
    for (const key of [
      'calories',
      'protein',
      'carbs',
      'fat',
      'dietary_fiber',
    ]) {
      expect(sql).toContain(`nutrients_snapshot->>'${key}'`);
    }
  });

  // Only six catalog micronutrients have a fixed column. Magnesium, vitamin D, vitamin K,
  // zinc and the B vitamins are user-defined nutrients living in the snapshot's
  // custom_nutrients object, so the fixed columns above cannot carry them at all and the
  // Diary would still understate the typical multivitamin (#2145).
  it('aggregates the custom nutrients a dose carries', async () => {
    mockClient = createMockDbClient([{}]);
    vi.mocked(getClient).mockResolvedValue(mockClient);

    await getDailySupplementTotals(userId, '2026-08-06');

    const sql = String(mockClient.query.mock.calls[0][0]);
    expect(sql).toContain("nutrients_snapshot->'custom_nutrients'");
    expect(sql).toContain('jsonb_object_agg(key, value)');
    expect(sql).toContain('AS custom_nutrients');
    // Same status filter and dose clamp as the fixed arm, because the custom rows are the
    // shared fragment rather than a second copy that could drift from it.
    expect(sql).toMatch(/\w+\.status IN \('taken', 'prn_taken'\)/);
    expect(sql).toMatch(
      /GREATEST\(COALESCE\(\w+\.dose_amount_snapshot, 1\), 0\)/
    );
    // Supplements alone. Unioning the food rows in here, the way getDailyNutritionSummary
    // does, would double-count every custom nutrient: callers add this arm onto totals
    // they have already derived from food entries themselves.
    expect(sql).not.toContain('food_entries');
  });

  it('returns the custom nutrient map the query produced', async () => {
    mockClient = createMockDbClient([
      { calories: '0', custom_nutrients: { Magnesium: 400, 'Vitamin D': 50 } },
    ]);
    vi.mocked(getClient).mockResolvedValue(mockClient);

    const totals = await getDailySupplementTotals(userId, '2026-08-06');

    expect(totals.custom_nutrients).toEqual({
      Magnesium: 400,
      'Vitamin D': 50,
    });
  });

  it('coerces a custom nutrient that summed to null', async () => {
    // sf_try_numeric returns NULL for a value it cannot parse; a key whose contributions
    // are all NULL sums to NULL and jsonb_object_agg emits it as JSON null.
    mockClient = createMockDbClient([
      { custom_nutrients: { Magnesium: null, Zinc: '15' } },
    ]);
    vi.mocked(getClient).mockResolvedValue(mockClient);

    const totals = await getDailySupplementTotals(userId, '2026-08-06');

    expect(totals.custom_nutrients.Magnesium).toBe(0);
    expect(totals.custom_nutrients.Zinc).toBe(15);
  });

  it('returns zeros, not nulls, on a day with no supplements', async () => {
    // COALESCE makes the SQL emit 0, but an empty result set must not become NaN either:
    // callers add these to food totals unconditionally.
    mockClient = createMockDbClient([]);
    vi.mocked(getClient).mockResolvedValue(mockClient);

    const totals = await getDailySupplementTotals(userId, '2026-08-06');

    expect(totals).toEqual(EMPTY_SUPPLEMENT_TOTALS);
    // Full width, not just the macros: the Diary card renders whichever fixed nutrients
    // the user has enabled, so a narrow zero object reintroduces #2145 on an empty day.
    const { custom_nutrients, ...fixed } = totals;
    expect(Object.keys(fixed).sort()).toEqual(
      [...FOOD_VARIANT_NUTRIENT_FIELDS].sort()
    );
    // An empty map rather than undefined, so callers can iterate without checking.
    expect(custom_nutrients).toEqual({});
  });

  it('coerces numeric strings, which is what pg returns for numeric columns', async () => {
    mockClient = createMockDbClient([
      {
        calories: '15',
        protein: '0',
        carbs: '0',
        fat: '1.5',
        dietary_fiber: '0',
      },
    ]);
    vi.mocked(getClient).mockResolvedValue(mockClient);

    const totals = await getDailySupplementTotals(userId, '2026-08-06');

    expect(totals.calories).toBe(15);
    expect(totals.fat).toBe(1.5);
  });
});
