import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../models/reportRepository.js', () => ({
  getDailyNutritionTotalsRange: vi.fn(),
}));
vi.mock('../models/intervalsNutritionPushRepository.js', () => ({
  getPushes: vi.fn(),
  upsertPushes: vi.fn(),
  deletePushes: vi.fn(),
  getPushSetting: vi.fn(),
  setPushSetting: vi.fn(),
  getPushSummary: vi.fn(),
  getUsersWithPushEnabled: vi.fn(),
}));
vi.mock('../integrations/intervals/intervalsService.js', () => ({
  getIntervalsCredentials: vi.fn().mockResolvedValue({
    providerId: 'p1',
    athleteId: 'i1',
    apiKey: 'k',
  }),
  intervalsGet: vi.fn(),
  intervalsPut: vi.fn(),
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../services/providerSyncClaim.js', () => ({
  startProviderSync: vi.fn(async (_t, sync) => ({ running: sync() })),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import {
  pushNutrition,
  removePushedData,
  runNightlyNutritionPush,
} from '../integrations/intervals/intervalsNutritionPush.js';
import { getDailyNutritionTotalsRange } from '../models/reportRepository.js';
import * as pushRepo from '../models/intervalsNutritionPushRepository.js';
import {
  intervalsGet,
  intervalsPut,
} from '../integrations/intervals/intervalsService.js';
import { startProviderSync } from '../services/providerSyncClaim.js';

const U = 'user-1';
const logged = (entry_date: string, kcal = 690) => ({
  entry_date,
  kcal_consumed: kcal,
  protein: 38.4,
  carbohydrates: 69.9,
  fat_total: 28.1,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDailyNutritionTotalsRange).mockResolvedValue([]);
  vi.mocked(pushRepo.getPushes).mockResolvedValue([]);
  vi.mocked(intervalsGet).mockResolvedValue([]);
  vi.mocked(intervalsPut).mockResolvedValue(undefined);
});

describe('pushNutrition', () => {
  it('pushes rounded daily totals for the three days ending on the given day', async () => {
    vi.mocked(getDailyNutritionTotalsRange).mockResolvedValue([
      {
        entry_date: '2020-01-15',
        calories: 689.6,
        protein: 38.44,
        carbs: 69.9,
        fat: 28.06,
      },
    ] as never);

    await expect(pushNutrition(U, 'p1', '2020-01-17')).resolves.toEqual({
      daysPushed: 1,
    });

    expect(getDailyNutritionTotalsRange).toHaveBeenCalledWith(
      U,
      '2020-01-15',
      '2020-01-17'
    );
    expect(intervalsPut).toHaveBeenCalledWith(
      expect.anything(),
      '/wellness-bulk',
      [
        {
          id: '2020-01-15',
          kcalConsumed: 690,
          protein: 38.4,
          carbohydrates: 69.9,
          fatTotal: 28.1,
        },
      ]
    );
    expect(pushRepo.upsertPushes).toHaveBeenCalledWith(U, [
      logged('2020-01-15'),
    ]);
  });

  it('sends nothing when Intervals already holds the same values', async () => {
    vi.mocked(getDailyNutritionTotalsRange).mockResolvedValue([
      {
        entry_date: '2020-01-15',
        calories: 690,
        protein: 38.4,
        carbs: 69.9,
        fat: 28.1,
      },
    ] as never);
    vi.mocked(intervalsGet).mockResolvedValue([
      {
        id: '2020-01-15',
        kcalConsumed: 690,
        protein: 38.4,
        carbohydrates: 69.9,
        fatTotal: 28.1,
      },
    ]);

    await expect(pushNutrition(U, 'p1', '2020-01-17')).resolves.toEqual({
      daysPushed: 0,
    });
    expect(intervalsPut).not.toHaveBeenCalled();
  });

  it('clears only our fields on a day whose food was all deleted', async () => {
    vi.mocked(pushRepo.getPushes).mockResolvedValue([logged('2020-01-16')]);
    vi.mocked(intervalsGet).mockResolvedValue([
      {
        id: '2020-01-16',
        kcalConsumed: 690,
        protein: 99,
        carbohydrates: 69.9,
        fatTotal: 28.1,
      },
    ]);

    await pushNutrition(U, 'p1', '2020-01-17');

    expect(intervalsPut).toHaveBeenCalledWith(
      expect.anything(),
      '/wellness-bulk',
      [{ id: '2020-01-16', kcalConsumed: -1, carbohydrates: -1, fatTotal: -1 }]
    );
    expect(pushRepo.deletePushes).toHaveBeenCalledWith(U, ['2020-01-16']);
  });

  it('logs nothing when Intervals rejects the push', async () => {
    vi.mocked(getDailyNutritionTotalsRange).mockResolvedValue([
      {
        entry_date: '2020-01-15',
        calories: 690,
        protein: 38.4,
        carbs: 69.9,
        fat: 28.1,
      },
    ] as never);
    vi.mocked(intervalsPut).mockRejectedValue(new Error('500'));

    await expect(pushNutrition(U, 'p1', '2020-01-17')).rejects.toThrow('500');
    expect(pushRepo.upsertPushes).not.toHaveBeenCalled();
    expect(pushRepo.deletePushes).not.toHaveBeenCalled();
  });
});

describe('removePushedData', () => {
  it('does nothing when nothing was pushed', async () => {
    await expect(removePushedData(U)).resolves.toEqual({
      cleared: 0,
      kept: 0,
      failed: 0,
    });
    expect(intervalsGet).not.toHaveBeenCalled();
  });

  it('clears our fields, leaves changed days alone and keeps failures for a retry', async () => {
    vi.mocked(pushRepo.getPushes).mockResolvedValue([
      logged('2020-01-15'),
      logged('2020-01-16'),
      logged('2020-01-17'),
    ]);
    vi.mocked(intervalsGet)
      .mockResolvedValueOnce([
        {
          id: '2020-01-15',
          kcalConsumed: 690,
          protein: 99,
          carbohydrates: 69.9,
          fatTotal: 28.1,
        },
        {
          id: '2020-01-16',
          kcalConsumed: 2000,
          protein: 1,
          carbohydrates: 1,
          fatTotal: 1,
        },
        {
          id: '2020-01-17',
          kcalConsumed: 690,
          protein: 38.4,
          carbohydrates: 69.9,
          fatTotal: 28.1,
        },
      ])
      .mockResolvedValueOnce([
        { id: '2020-01-15', protein: 99 },
        {
          id: '2020-01-16',
          kcalConsumed: 2000,
          protein: 1,
          carbohydrates: 1,
          fatTotal: 1,
        },
        { id: '2020-01-17', kcalConsumed: 690 },
      ]);

    await expect(removePushedData(U, 'p1')).resolves.toEqual({
      cleared: 1,
      kept: 1,
      failed: 1,
    });

    expect(intervalsGet).toHaveBeenCalledWith(expect.anything(), '/wellness', {
      oldest: '2020-01-15',
      newest: '2020-01-17',
      fields: 'id,kcalConsumed,protein,carbohydrates,fatTotal',
    });
    expect(intervalsPut).toHaveBeenCalledWith(
      expect.anything(),
      '/wellness-bulk',
      [
        { id: '2020-01-15', kcalConsumed: -1, carbohydrates: -1, fatTotal: -1 },
        {
          id: '2020-01-17',
          kcalConsumed: -1,
          protein: -1,
          carbohydrates: -1,
          fatTotal: -1,
        },
      ]
    );
    expect(pushRepo.deletePushes).toHaveBeenCalledWith(U, [
      '2020-01-15',
      '2020-01-16',
    ]);
  });

  it('keeps every attempted day logged when the clearing PUT fails', async () => {
    vi.mocked(pushRepo.getPushes).mockResolvedValue([logged('2020-01-15')]);
    vi.mocked(intervalsGet).mockResolvedValue([
      {
        id: '2020-01-15',
        kcalConsumed: 690,
        protein: 38.4,
        carbohydrates: 69.9,
        fatTotal: 28.1,
      },
    ]);
    vi.mocked(intervalsPut).mockRejectedValue(new Error('429'));

    await expect(removePushedData(U)).resolves.toEqual({
      cleared: 0,
      kept: 0,
      failed: 1,
    });
    expect(pushRepo.deletePushes).toHaveBeenCalledWith(U, []);
  });
});

describe('runNightlyNutritionPush', () => {
  it('pushes each opted-in user under their sync claim and survives a failure', async () => {
    vi.mocked(pushRepo.getUsersWithPushEnabled).mockResolvedValue([
      { user_id: 'a', provider_id: 'pa' },
      { user_id: 'b', provider_id: 'pb' },
    ]);
    vi.mocked(intervalsGet).mockRejectedValueOnce(new Error('down'));

    await expect(runNightlyNutritionPush()).resolves.toBeUndefined();

    expect(startProviderSync).toHaveBeenCalledWith(
      { userId: 'a', providerId: 'pa' },
      expect.any(Function)
    );
    expect(startProviderSync).toHaveBeenCalledWith(
      { userId: 'b', providerId: 'pb' },
      expect.any(Function)
    );
  });
});
