import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(async () => ({ query, release: vi.fn() })),
  getSystemClient: vi.fn(),
}));

import { getCalendarEntries } from '../models/reportRepository.js';
import { CalendarEntryLimitError } from '../utils/errors.js';

const row = (i: number) => ({
  id: `e${i}`,
  day: '2026-10-12',
  exercise_name: 'Run',
  category: null,
  notes: null,
  provider_name: null,
  detail_data: null,
  exercise_source_id: null,
  duration_minutes: 30,
  distance: null,
  avg_heart_rate: null,
  workout_plan_assignment_id: null,
  preset_entry_id: null,
  preset_name: null,
});

beforeEach(() => vi.clearAllMocks());

describe('getCalendarEntries row limit', () => {
  it('returns every row up to the limit', async () => {
    query.mockResolvedValue({
      rows: Array.from({ length: 5000 }, (_, i) => row(i)),
    });
    const rows = await getCalendarEntries('u', '2026-10-01', '2026-10-31');
    expect(rows).toHaveLength(5000);
  });

  it('refuses a range over the limit instead of dropping the oldest entry', async () => {
    query.mockResolvedValue({
      rows: Array.from({ length: 5001 }, (_, i) => row(i)),
    });
    await expect(
      getCalendarEntries('u', '2026-10-01', '2026-10-31')
    ).rejects.toBeInstanceOf(CalendarEntryLimitError);
  });
});
