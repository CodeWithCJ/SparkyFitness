import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as reportRepository from '../models/reportRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));

describe('getCustomMeasurementsData - large dataset downsampling', () => {
  const mockQuery = vi.fn();
  const mockClient = { query: mockQuery, release: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    (getClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);
  });

  it('caps returned points via an evenly-spaced window-function downsample', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await reportRepository.getCustomMeasurementsData(
      'user-1',
      'cat-1',
      '2020-01-01',
      '2026-08-07'
    );

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];

    // The downsample guard must be present to avoid a RangeError when a
    // category contains a very large number of rows (e.g. years of intraday
    // heart-rate samples). See reportService.getReportsData which pushes every
    // returned row into a single array.
    expect(sql).toMatch(/row_number\(\)\s+OVER/i);
    expect(sql).toMatch(/count\(\*\)\s+OVER\s*\(\)/i);
    expect(sql).toMatch(/GREATEST\(1,\s*CEIL\(total::float/i);
    // First row is included via (rn - 1) % step = 0, not a separate OR clause,
    // guaranteeing the result never exceeds maxPoints.
    expect(sql).toMatch(/\(rn\s*-\s*1\)\s*%\s*GREATEST/i);
    // The cap is bound as the 5th query parameter and must stay bounded.
    expect(params).toHaveLength(5);
    expect(params[4]).toBeLessThanOrEqual(3000);
    expect(params[4]).toBeGreaterThan(1000);
  });

  it('returns the (already downsampled) rows unchanged', async () => {
    const rows = [
      {
        category_id: 'cat-1',
        entry_date: '2026-01-01',
        entry_hour: 8,
        value: '72',
        notes: null,
        entry_timestamp: null,
      },
      {
        category_id: 'cat-1',
        entry_date: '2026-01-02',
        entry_hour: 9,
        value: '75',
        notes: null,
        entry_timestamp: null,
      },
    ];
    mockQuery.mockResolvedValueOnce({ rows });

    const result = await reportRepository.getCustomMeasurementsData(
      'user-1',
      'cat-1',
      '2026-01-01',
      '2026-01-02'
    );

    expect(result).toEqual(rows);
  });
});
