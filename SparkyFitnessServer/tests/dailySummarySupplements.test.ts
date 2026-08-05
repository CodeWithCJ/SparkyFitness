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
