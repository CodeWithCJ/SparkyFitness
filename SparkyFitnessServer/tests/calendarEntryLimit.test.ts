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

// A diary of `total` rows that answers like the database: it honours the
// query's own LIMIT, so a query that stops asking for the overflow row would
// silently truncate here too.
const diary = (total: number) =>
  query.mockImplementation(async (sql: string) => {
    const limit = Number(/LIMIT\s+(\d+)\s*$/i.exec(sql.trim())?.[1] ?? total);
    return {
      rows: Array.from({ length: Math.min(total, limit) }, (_, i) => row(i)),
    };
  });

describe('getCalendarEntries row limit', () => {
  it('asks for one row past the limit, so an overflow is detectable', async () => {
    diary(10);
    await getCalendarEntries('u', '2026-10-01', '2026-10-31');
    expect(query.mock.calls[0]![0]).toMatch(/LIMIT\s+5001\s*$/);
  });

  it('returns every row up to the limit', async () => {
    diary(5000);
    const rows = await getCalendarEntries('u', '2026-10-01', '2026-10-31');
    expect(rows).toHaveLength(5000);
  });

  it('refuses a range over the limit instead of dropping the oldest entry', async () => {
    diary(6000);
    await expect(
      getCalendarEntries('u', '2026-10-01', '2026-10-31')
    ).rejects.toBeInstanceOf(CalendarEntryLimitError);
  });
});
