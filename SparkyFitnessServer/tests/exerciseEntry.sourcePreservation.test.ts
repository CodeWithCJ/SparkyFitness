import { describe, it, expect, vi, beforeEach } from 'vitest';
import exerciseEntryDb from '../models/exerciseEntry.js';
import * as poolManager from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

// Editing a provider-synced entry used to reassign it to 'manual', because the
// repository defaulted the source at the call site instead of letting the
// update helper fall back to the row's existing value. That silently removed
// the entry from "delete my <provider> data" forever.
describe('updateExerciseEntry preserves provider provenance', () => {
  const existingEntry = {
    id: 'entry-1',
    user_id: 'user-1',
    exercise_id: 'ex-1',
    entry_date: '2026-07-30',
    duration_minutes: 45,
    calories_burned: 400,
    source: 'garmin',
    source_id: 'garmin-activity-9',
  };

  const mockClient = { query: vi.fn(), release: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    (poolManager.getClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockClient
    );
    mockClient.query.mockImplementation((sql: string) => {
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [] };
      if (/SELECT \* FROM exercise_entries/i.test(sql)) {
        return { rows: [existingEntry] };
      }
      // The UPDATE ... RETURNING *
      return { rows: [{ ...existingEntry }] };
    });
  });

  // The source the UPDATE actually wrote. Matched on `source = $14` so this
  // cannot accidentally pick up the narrower UPDATE elsewhere in the module,
  // which binds source to a different placeholder.
  const writtenSource = () => {
    const updateCall = mockClient.query.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === 'string' &&
        /UPDATE exercise_entries/i.test(c[0]) &&
        /source\s*=\s*\$14/.test(c[0])
    );
    expect(updateCall, 'expected the main UPDATE to have run').toBeDefined();
    const params = updateCall?.[1] as unknown[];
    return params?.[13];
  };

  it("keeps 'garmin' when a diary edit sends no source", async () => {
    await exerciseEntryDb.updateExerciseEntry('entry-1', 'user-1', 'user-1', {
      duration_minutes: 50,
    });

    expect(writtenSource()).toBe('garmin');
  });

  it('still honours an explicitly supplied source', async () => {
    await exerciseEntryDb.updateExerciseEntry('entry-1', 'user-1', 'user-1', {
      duration_minutes: 50,
      source: 'manual',
    });

    expect(writtenSource()).toBe('manual');
  });
});
