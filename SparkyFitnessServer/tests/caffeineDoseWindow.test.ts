import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getActiveCaffeineKinetics } from '../services/caffeineKineticsService.js';
import * as foodMisc from '../models/foodMisc.js';
import * as preferenceRepo from '../models/preferenceRepository.js';
import * as timezoneLoader from '../utils/timezoneLoader.js';

describe('Caffeine Dose Window and Fallback Hierarchy', () => {
  const userId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    vi.spyOn(timezoneLoader, 'loadUserTimezone').mockResolvedValue('UTC');
    vi.spyOn(preferenceRepo, 'getUserPreferences').mockResolvedValue({
      id: 'pref-1',
      user_id: userId,
      caffeine_half_life_hours: 5.0,
      target_bedtime: '22:30:00',
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('queries a 3-day window (startDate = date - 2 days, endDate = date)', async () => {
    const getDosesSpy = vi
      .spyOn(foodMisc, 'getNutrientDosesForWindow')
      .mockResolvedValue([]);

    await getActiveCaffeineKinetics(userId, { date: '2026-09-05' });

    expect(getDosesSpy).toHaveBeenCalledWith(
      userId,
      '2026-09-03',
      '2026-09-05',
      'caffeine_mg'
    );
  });

  it('resolves explicit entry_time first without marking as estimated', async () => {
    vi.spyOn(foodMisc, 'getNutrientDosesForWindow').mockResolvedValue([
      {
        source: 'food',
        entry_date: '2026-09-05',
        entry_time: '08:15',
        meal_default_time: '07:00',
        taken_at: null,
        amount: 95,
        name: 'Coffee',
      },
    ]);

    const result = await getActiveCaffeineKinetics(userId, {
      date: '2026-09-05',
      now: '2026-09-05T09:15:00.000Z',
    });

    expect(result.doses).toHaveLength(1);
    expect(result.doses[0].at).toBe('2026-09-05T08:15:00.000Z');
    expect(result.doses[0].is_estimated).toBe(false);
    expect(result.has_estimated_times).toBe(false);
  });

  it('falls back to meal_types.default_time when entry_time is NULL', async () => {
    vi.spyOn(foodMisc, 'getNutrientDosesForWindow').mockResolvedValue([
      {
        source: 'food',
        entry_date: '2026-09-05',
        entry_time: null,
        meal_default_time: '07:30',
        taken_at: null,
        amount: 80,
        name: 'Black Tea',
      },
    ]);

    const result = await getActiveCaffeineKinetics(userId, {
      date: '2026-09-05',
      now: '2026-09-05T09:00:00.000Z',
    });

    expect(result.doses).toHaveLength(1);
    expect(result.doses[0].at).toBe('2026-09-05T07:30:00.000Z');
    expect(result.doses[0].is_estimated).toBe(true);
    expect(result.has_estimated_times).toBe(true);
  });

  it('falls back to 12:00 noon when both entry_time and meal_default_time are NULL', async () => {
    vi.spyOn(foodMisc, 'getNutrientDosesForWindow').mockResolvedValue([
      {
        source: 'food',
        entry_date: '2026-09-05',
        entry_time: null,
        meal_default_time: null,
        taken_at: null,
        amount: 150,
        name: 'Energy Drink',
      },
    ]);

    const result = await getActiveCaffeineKinetics(userId, {
      date: '2026-09-05',
      now: '2026-09-05T13:00:00.000Z',
    });

    expect(result.doses).toHaveLength(1);
    expect(result.doses[0].at).toBe('2026-09-05T12:00:00.000Z');
    expect(result.doses[0].is_estimated).toBe(true);
    expect(result.has_estimated_times).toBe(true);
  });

  it('includes supplement doses with taken_at timestamp', async () => {
    vi.spyOn(foodMisc, 'getNutrientDosesForWindow').mockResolvedValue([
      {
        source: 'supplement',
        entry_date: '2026-09-05',
        entry_time: null,
        meal_default_time: null,
        taken_at: new Date('2026-09-05T06:00:00.000Z'),
        amount: 200,
        name: 'Pre-workout',
      },
    ]);

    const result = await getActiveCaffeineKinetics(userId, {
      date: '2026-09-05',
      now: '2026-09-05T11:00:00.000Z', // 5 hours later -> 1 half life
    });

    expect(result.doses).toHaveLength(1);
    expect(result.doses[0].at).toBe('2026-09-05T06:00:00.000Z');
    expect(result.doses[0].is_estimated).toBe(false);
    expect(result.active_mg_now).toBe(100);
  });

  it('calculates bedtimeAt as midnight of concluding day when target_bedtime is 00:00', async () => {
    vi.spyOn(preferenceRepo, 'getUserPreferences').mockResolvedValue({
      id: 'pref-1',
      user_id: userId,
      caffeine_half_life_hours: 5.0,
      target_bedtime: '00:00:00',
    } as any);
    vi.spyOn(foodMisc, 'getNutrientDosesForWindow').mockResolvedValue([]);

    const result = await getActiveCaffeineKinetics(userId, {
      date: '2026-09-05',
    });

    // 00:00 for the waking day 2026-09-05 should be the midnight transition to 2026-09-06
    expect(result.target_bedtime).toBe('00:00');
    expect(result.bedtime_at).toBe('2026-09-06T00:00:00.000Z');
  });

  it('calculates bedtimeAt on next calendar morning when target_bedtime is early morning (e.g. 01:30)', async () => {
    vi.spyOn(preferenceRepo, 'getUserPreferences').mockResolvedValue({
      id: 'pref-1',
      user_id: userId,
      caffeine_half_life_hours: 5.0,
      target_bedtime: '01:30:00',
    } as any);
    const getDosesSpy = vi
      .spyOn(foodMisc, 'getNutrientDosesForWindow')
      .mockResolvedValue([
        {
          source: 'food',
          entry_date: '2026-09-06',
          entry_time: '00:30',
          meal_default_time: null,
          taken_at: null,
          amount: 100,
          name: 'Late Espresso',
        },
      ]);

    const result = await getActiveCaffeineKinetics(userId, {
      date: '2026-09-05',
    });

    expect(getDosesSpy).toHaveBeenCalledWith(
      userId,
      '2026-09-03',
      '2026-09-06',
      'caffeine_mg'
    );
    expect(result.target_bedtime).toBe('01:30');
    expect(result.bedtime_at).toBe('2026-09-06T01:30:00.000Z');
    expect(result.doses).toHaveLength(1);
    expect(result.doses[0].at).toBe('2026-09-06T00:30:00.000Z');
    expect(result.has_estimated_times).toBe(false);
  });

  it('does not flag has_estimated_times when an untimed dose on date+1 falls after bedtime+2h', async () => {
    vi.spyOn(preferenceRepo, 'getUserPreferences').mockResolvedValue({
      id: 'pref-1',
      user_id: userId,
      caffeine_half_life_hours: 5.0,
      target_bedtime: '00:00:00',
    } as any);
    vi.spyOn(foodMisc, 'getNutrientDosesForWindow').mockResolvedValue([
      {
        source: 'food',
        entry_date: '2026-09-06',
        entry_time: null,
        meal_default_time: null,
        taken_at: null,
        amount: 80,
        name: 'Untimed Lunch Coffee on Next Day',
      },
    ]);

    const result = await getActiveCaffeineKinetics(userId, {
      date: '2026-09-05',
    });

    expect(result.target_bedtime).toBe('00:00');
    expect(result.bedtime_at).toBe('2026-09-06T00:00:00.000Z');
    expect(result.doses).toHaveLength(0);
    expect(result.has_estimated_times).toBe(false);
  });

  it('calculates bedtimeAt on same calendar day when target_bedtime is before midnight (e.g. 23:59)', async () => {
    vi.spyOn(preferenceRepo, 'getUserPreferences').mockResolvedValue({
      id: 'pref-1',
      user_id: userId,
      caffeine_half_life_hours: 5.0,
      target_bedtime: '23:59:00',
    } as any);
    vi.spyOn(foodMisc, 'getNutrientDosesForWindow').mockResolvedValue([]);

    const result = await getActiveCaffeineKinetics(userId, {
      date: '2026-09-05',
    });

    expect(result.target_bedtime).toBe('23:59');
    expect(result.bedtime_at).toBe('2026-09-05T23:59:00.000Z');
  });
});

// The repository tests above mock the query, so nothing there notices which
// table the meal time came from. A user's own meal times live in
// user_meal_visibilities and the built-in meal_types rows carry NULL, so
// reading only the base table silently anchored every untimed entry at noon --
// four hours off for a user whose Snacks is 16:00.
describe("the dose query reads the user's own meal times", () => {
  const source = readFileSync(
    new URL('../models/foodMisc.ts', import.meta.url),
    'utf8'
  );

  it('COALESCEs the per-user override the way getAllMealTypes does', () => {
    expect(source).toContain(
      'COALESCE(umv.default_time, mt.default_time)::text AS meal_default_time'
    );
    expect(source).toContain('LEFT JOIN user_meal_visibilities umv');
  });
});
