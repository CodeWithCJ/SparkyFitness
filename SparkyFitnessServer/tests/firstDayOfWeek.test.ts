import { beforeEach, describe, expect, it, vi } from 'vitest';
import preferenceRepository from '../models/preferenceRepository.js';
import {
  firstDayOfWeekOf,
  loadFirstDayOfWeek,
} from '../utils/firstDayOfWeek.js';

vi.mock('../models/preferenceRepository.js');

describe('firstDayOfWeekOf', () => {
  it('reads the preference, stored as a number or numeric text', () => {
    expect(firstDayOfWeekOf({ first_day_of_week: 1 })).toBe(1);
    expect(firstDayOfWeekOf({ first_day_of_week: '6' })).toBe(6);
    expect(firstDayOfWeekOf({ first_day_of_week: 0 })).toBe(0);
  });

  it('falls back to Sunday when unset or not a day of the week', () => {
    expect(firstDayOfWeekOf(undefined)).toBe(0);
    expect(firstDayOfWeekOf(null)).toBe(0);
    expect(firstDayOfWeekOf({})).toBe(0);
    expect(firstDayOfWeekOf({ first_day_of_week: null })).toBe(0);
    expect(firstDayOfWeekOf({ first_day_of_week: 'monday' })).toBe(0);
    expect(firstDayOfWeekOf({ first_day_of_week: 7 })).toBe(0);
    expect(firstDayOfWeekOf({ first_day_of_week: -1 })).toBe(0);
    expect(firstDayOfWeekOf({ first_day_of_week: 2.5 })).toBe(0);
  });
});

describe('loadFirstDayOfWeek', () => {
  beforeEach(() => vi.resetAllMocks());

  it("reads the user's preferences", async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      first_day_of_week: 1,
    });

    expect(await loadFirstDayOfWeek('u1')).toBe(1);
    expect(preferenceRepository.getUserPreferences).toHaveBeenCalledWith('u1');
  });

  it('is Sunday for a user without preferences', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue(
      undefined
    );

    expect(await loadFirstDayOfWeek('u1')).toBe(0);
  });
});
