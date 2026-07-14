import { vi, beforeEach, describe, expect, it } from 'vitest';
import { todayInZone, addDays } from '@workspace/shared';
import { getUserPreferences } from '../models/preferenceRepository.js';
import { resolveTemplateStartDay } from '../utils/timezoneLoader.js';

vi.mock('../models/preferenceRepository', () => ({
  getUserPreferences: vi.fn(),
}));

const USER = 'user-1';

beforeEach(() => {
  vi.mocked(getUserPreferences).mockResolvedValue({ timezone: 'UTC' });
});

describe('resolveTemplateStartDay', () => {
  it('falls back to the user today when no client date is supplied', async () => {
    const today = todayInZone('UTC');
    expect(await resolveTemplateStartDay(USER)).toBe(today);
    expect(await resolveTemplateStartDay(USER, null)).toBe(today);
  });

  it('honors a client date on or after today (timezone ahead of the server)', async () => {
    const today = todayInZone('UTC');
    const future = addDays(today, 3);
    expect(await resolveTemplateStartDay(USER, future)).toBe(future);
    expect(await resolveTemplateStartDay(USER, today)).toBe(today);
  });

  it('clamps a past client date up to today so template history is never purged', async () => {
    const today = todayInZone('UTC');
    expect(await resolveTemplateStartDay(USER, '2000-01-01')).toBe(today);
    expect(await resolveTemplateStartDay(USER, addDays(today, -1))).toBe(today);
  });

  it('ignores malformed client dates and falls back to today', async () => {
    const today = todayInZone('UTC');
    for (const bad of [
      '-infinity',
      'infinity',
      'not-a-date',
      '2026-13-40',
      '2026-02-30',
      '2026-07-14T00:00:00Z',
      '',
    ]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(await resolveTemplateStartDay(USER, bad as any)).toBe(today);
    }
  });
});
