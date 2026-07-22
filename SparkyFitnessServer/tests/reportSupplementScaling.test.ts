import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { getClient } from '../db/poolManager.js';
import { getNutritionData } from '../models/reportRepository.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

// A supplement entry snapshots ONE dose's payload; the report must scale it by the number of
// doses that entry logged (dose_amount_snapshot, derived from the schedule's dose override),
// or a "take 2" schedule silently undercounts every nutrient. This is a count, not the
// medication's mg strength (which is the scaling we deliberately DON'T do).
describe('getNutritionData — supplement dose scaling', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;
  const userId = uuidv4();

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
    // @ts-expect-error mocked in the module mock above
    getClient.mockResolvedValue(mockClient);
  });

  afterEach(() => vi.clearAllMocks());

  it('multiplies both fixed and custom supplement nutrients by dose_amount_snapshot', async () => {
    await getNutritionData(userId, '2026-07-01', '2026-07-01', [
      { name: 'Boron' },
    ]);

    const sql = String(mockClient.query.mock.calls[0][0]);

    // Fixed-field supplement select is scaled (and clamped so a non-positive value can't
    // subtract from the total)...
    expect(sql).toContain(
      "public.sf_try_numeric(me.nutrients_snapshot->>'calories'), 0) * GREATEST(COALESCE(me.dose_amount_snapshot, 1), 0)"
    );
    // ...and so is the custom-nutrient supplement select.
    expect(sql).toContain(
      "me.nutrients_snapshot->'custom_nutrients'->>'Boron'), 0) * GREATEST(COALESCE(me.dose_amount_snapshot, 1), 0)"
    );
    // The food arm must NOT be dose-scaled — that multiplier is supplement-only.
    expect(sql).not.toContain('fe.calories, 0) * GREATEST(');
  });
});
