import { vi, beforeEach, describe, it, expect } from 'vitest';

const processSleepEntry = vi.fn();
vi.mock('../services/measurementService.js', () => ({
  default: {
    processSleepEntry: (...args: unknown[]) => processSleepEntry(...args),
  },
}));
const deleteSleepEntriesByEntrySourceAndDate = vi
  .fn()
  .mockResolvedValue(undefined);
vi.mock('../models/sleepRepository.js', () => ({
  default: {
    deleteSleepEntriesByEntrySourceAndDate: (...args: unknown[]) =>
      deleteSleepEntriesByEntrySourceAndDate(...args),
  },
}));
vi.mock('../models/moodRepository.js', () => ({ default: {} }));
vi.mock('../models/food.js', () => ({ default: {} }));
vi.mock('../models/foodEntry.js', () => ({ default: {} }));
vi.mock('../models/mealType.js', () => ({ default: {} }));
vi.mock('../models/genericHealthRepository.js', () => ({}));
vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { processGarminSleepData } from '../services/garmin/garminHealthProcessor.js';

const night = (overrides: Record<string, unknown> = {}) => ({
  entry_date: '2026-10-15',
  bedtime: '2026-10-14T23:00:00',
  wake_time: '2026-10-15T07:00:00',
  duration_in_seconds: 28800,
  source: 'garmin',
  ...overrides,
});

beforeEach(() => {
  processSleepEntry.mockReset();
  processSleepEntry.mockResolvedValue({ id: 'sleep-1' });
  deleteSleepEntriesByEntrySourceAndDate.mockClear();
});

describe('processGarminSleepData', () => {
  it('processes a night with both times', async () => {
    const result = await processGarminSleepData(
      'user-1',
      'user-1',
      [night()],
      '2026-10-15',
      '2026-10-15'
    );
    expect(processSleepEntry).toHaveBeenCalledWith('user-1', 'user-1', night());
    expect(result.processed).toHaveLength(1);
  });

  it('fails a night without a valid bedtime or wake time on its own, and still processes the rest', async () => {
    const missingWake = night({
      entry_date: '2026-10-13',
      wake_time: undefined,
    });
    const badBedtime = night({
      entry_date: '2026-10-14',
      bedtime: 'not a time',
    });

    const run = processGarminSleepData(
      'user-1',
      'user-1',
      [missingWake, badBedtime, night()],
      '2026-10-13',
      '2026-10-15'
    );

    await expect(run).rejects.toThrow(
      'Some Garmin sleep entries could not be processed.'
    );
    const report = JSON.parse(
      ((await run.catch((e: unknown) => e)) as Error).message
    ) as {
      processed: unknown[];
      errors: { message: string; entry: { entry_date: string } }[];
    };
    expect(report.errors.map((e) => e.entry.entry_date)).toEqual([
      '2026-10-13',
      '2026-10-14',
    ]);
    expect(report.errors[0].message).toBe(
      'Garmin sleep entry is missing a valid bedtime or wake_time.'
    );
    expect(report.processed).toHaveLength(1);
    expect(processSleepEntry).toHaveBeenCalledTimes(1);
    expect(processSleepEntry).toHaveBeenCalledWith('user-1', 'user-1', night());
  });
  it('clears only the nights Garmin returned, not the whole requested range', async () => {
    const earlier = night({
      entry_date: '2026-10-13',
      bedtime: '2026-10-12T23:00:00',
      wake_time: '2026-10-13T07:00:00',
    });

    await processGarminSleepData(
      'user-1',
      'user-1',
      [earlier, night()],
      '2026-10-12',
      '2026-10-15'
    );

    expect(deleteSleepEntriesByEntrySourceAndDate.mock.calls).toEqual([
      ['user-1', 'garmin', '2026-10-13', '2026-10-13'],
      ['user-1', 'garmin', '2026-10-15', '2026-10-15'],
    ]);
  });

  it('clears a night once when Garmin returns it twice', async () => {
    await processGarminSleepData(
      'user-1',
      'user-1',
      [night({ duration_in_seconds: 3600 }), night()],
      '2026-10-15',
      '2026-10-15'
    );

    expect(deleteSleepEntriesByEntrySourceAndDate).toHaveBeenCalledTimes(1);
    expect(deleteSleepEntriesByEntrySourceAndDate).toHaveBeenCalledWith(
      'user-1',
      'garmin',
      '2026-10-15',
      '2026-10-15'
    );
  });

  it('clears every returned night before inserting any of them', async () => {
    await processGarminSleepData(
      'user-1',
      'user-1',
      [night({ entry_date: '2026-10-14' }), night()],
      '2026-10-14',
      '2026-10-15'
    );

    const lastDelete = Math.max(
      ...deleteSleepEntriesByEntrySourceAndDate.mock.invocationCallOrder
    );
    const firstInsert = Math.min(...processSleepEntry.mock.invocationCallOrder);
    expect(lastDelete).toBeLessThan(firstInsert);
  });

  it('leaves the table alone for an entry without a calendar entry_date', async () => {
    await processGarminSleepData(
      'user-1',
      'user-1',
      [night({ entry_date: undefined })],
      '2026-10-15',
      '2026-10-15'
    );

    expect(deleteSleepEntriesByEntrySourceAndDate).not.toHaveBeenCalled();
    expect(processSleepEntry).toHaveBeenCalledTimes(1);
  });
});
