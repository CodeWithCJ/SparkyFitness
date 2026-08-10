import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
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
    expect(sql).toContain("me.status IN ('taken', 'prn_taken')");
    expect(sql).toContain('GREATEST(COALESCE(me.dose_amount_snapshot, 1), 0)');
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
    expect(sql).toContain('GREATEST(COALESCE(me.dose_amount_snapshot, 1), 0)');
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
    expect(sql).toContain("me.status IN ('taken', 'prn_taken')");
    expect(sql).toContain('GREATEST(COALESCE(me.dose_amount_snapshot, 1), 0)');
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

  it('returns zeros, not nulls, on a day with no supplements', async () => {
    // COALESCE makes the SQL emit 0, but an empty result set must not become NaN either:
    // callers add these to food totals unconditionally.
    mockClient = createMockDbClient([]);
    vi.mocked(getClient).mockResolvedValue(mockClient);

    const totals = await getDailySupplementTotals(userId, '2026-08-06');

    expect(totals).toEqual({
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      dietary_fiber: 0,
    });
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
