import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import foodRepository from '../models/foodMisc.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));

// The double-counting rule (#1557, #2115): a food_entries row contributes
// food-derived water iff no water_intake_entries row references it via
// food_entry_id. These tests assert the SQL shape rather than a live
// computation, matching the mocking pattern used across models/*.test.ts.

describe('foodMisc getFoodDerivedWaterMlForDate / getFoodDerivedWaterMlByDateRange', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    // @ts-expect-error TS(2339): mock helper
    getClient.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('excludes food_entries rows already linked to a water_intake_entries row', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ food_ml: '750' }] });

    const result = await foodRepository.getFoodDerivedWaterMlForDate(
      'user-1',
      '2026-09-05'
    );

    expect(result).toBe(750);
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('water_intake_entries wie');
    expect(sql).toContain('wie.food_entry_id = fe.id');
    expect(params).toEqual(['user-1', '2026-09-05']);
  });

  it('prefers the explicit water_ml column over the volume fallback', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ food_ml: '0' }] });

    await foodRepository.getFoodDerivedWaterMlForDate('user-1', '2026-09-05');

    const sql = mockClient.query.mock.calls[0][0] as string;
    expect(sql).toContain('NULLIF(fe.water_ml, 0)');
    expect(sql).toContain('sf_volume_unit_to_ml(fe.unit)');
    // COALESCE argument order: explicit column first, volume fallback second.
    const explicitIdx = sql.indexOf('NULLIF(fe.water_ml, 0)');
    const fallbackIdx = sql.indexOf('sf_volume_unit_to_ml(fe.unit)');
    expect(explicitIdx).toBeGreaterThan(-1);
    expect(fallbackIdx).toBeGreaterThan(explicitIdx);
  });

  it('defaults to 0 when the query returns no rows', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ food_ml: null }] });

    const result = await foodRepository.getFoodDerivedWaterMlForDate(
      'user-1',
      '2026-09-05'
    );

    expect(result).toBe(0);
  });

  it('always releases the client, even on failure', async () => {
    mockClient.query.mockRejectedValue(new Error('DB error'));

    await expect(
      foodRepository.getFoodDerivedWaterMlForDate('user-1', '2026-09-05')
    ).rejects.toThrow('DB error');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('getFoodDerivedWaterMlByDateRange groups by entry_date and applies the same exclusion', async () => {
    mockClient.query.mockResolvedValue({
      rows: [
        { entry_date: '2026-09-04', food_ml: '100' },
        { entry_date: '2026-09-05', food_ml: '250' },
      ],
    });

    const result = await foodRepository.getFoodDerivedWaterMlByDateRange(
      'user-1',
      '2026-09-01',
      '2026-09-07'
    );

    expect(result).toHaveLength(2);
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('GROUP BY fe.entry_date');
    expect(sql).toContain('NOT EXISTS');
    expect(params).toEqual(['user-1', '2026-09-01', '2026-09-07']);
  });
});
