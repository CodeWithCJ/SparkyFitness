import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertDailyHealthMetrics = vi.hoisted(() => vi.fn());

vi.mock('../models/genericHealthRepository.js', () => ({
  upsertDailyHealthMetrics,
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import {
  normalizeVo2Max,
  saveDailyVo2Max,
} from '../utils/vo2MaxDailySummary.js';

describe('normalizeVo2Max', () => {
  it('rounds to one decimal and accepts numeric strings', () => {
    expect(normalizeVo2Max(46.04)).toBe(46);
    expect(normalizeVo2Max('51.26')).toBe(51.3);
  });

  it('rejects values outside the plausible range or not numbers', () => {
    expect(normalizeVo2Max(9.9)).toBeNull();
    expect(normalizeVo2Max(100.1)).toBeNull();
    expect(normalizeVo2Max('')).toBeNull();
    expect(normalizeVo2Max(null)).toBeNull();
    expect(normalizeVo2Max(Number.NaN)).toBeNull();
  });
});

describe('saveDailyVo2Max', () => {
  beforeEach(() => {
    upsertDailyHealthMetrics.mockReset();
  });

  it('writes the day row for the provider', async () => {
    upsertDailyHealthMetrics.mockResolvedValue(undefined);
    await saveDailyVo2Max('u1', 'u1', '2026-11-20', 47.34, 'fitbit');
    expect(upsertDailyHealthMetrics).toHaveBeenCalledWith('u1', 'u1', {
      user_id: 'u1',
      entry_date: '2026-11-20',
      source_provider: 'fitbit',
      vo2_max: 47.3,
    });
  });

  it('skips an out-of-range value', async () => {
    await saveDailyVo2Max('u1', 'u1', '2026-11-20', 250, 'oura');
    expect(upsertDailyHealthMetrics).not.toHaveBeenCalled();
  });

  it('does not throw when the write fails', async () => {
    upsertDailyHealthMetrics.mockRejectedValue(new Error('db down'));
    await expect(
      saveDailyVo2Max('u1', 'u1', '2026-11-20', 45, 'withings')
    ).resolves.toBeUndefined();
  });
});
