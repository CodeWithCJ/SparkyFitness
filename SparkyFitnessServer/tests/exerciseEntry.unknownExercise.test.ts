import { beforeEach, describe, expect, it, vi } from 'vitest';
import exerciseEntryDb from '../models/exerciseEntry.js';
import exerciseRepository from '../models/exercise.js';
import * as poolManager from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../models/exercise.js', () => ({
  default: { getExerciseById: vi.fn() },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

// The shared error handler answers with the error's status, so an exercise_id
// with no visible library exercise must carry 404 out of the model.
describe('exercise entry model with an unknown exercise_id', () => {
  const existingEntry = {
    id: 'entry-1',
    user_id: 'user-1',
    exercise_id: 'ex-1',
    entry_date: '2026-10-15',
    duration_minutes: 45,
    calories_burned: 400,
    source: 'manual',
  };
  const mockClient = { query: vi.fn(), release: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(poolManager.getClient).mockResolvedValue(
      mockClient as unknown as Awaited<ReturnType<typeof poolManager.getClient>>
    );
    vi.mocked(exerciseRepository.getExerciseById).mockResolvedValue(null);
    mockClient.query.mockImplementation((sql: string) => {
      if (/SELECT \* FROM exercise_entries/i.test(sql)) {
        return { rows: [existingEntry] };
      }
      return { rows: [] };
    });
  });

  it('rejects an update to a missing exercise with status 404', async () => {
    await expect(
      exerciseEntryDb.updateExerciseEntry('entry-1', 'user-1', 'user-1', {
        exercise_id: 'no-such-exercise',
      })
    ).rejects.toMatchObject({
      message: 'Exercise not found.',
      status: 404,
    });
  });

  it('rejects a create for a missing exercise with status 404', async () => {
    await expect(
      exerciseEntryDb.createExerciseEntry(
        'user-1',
        {
          exercise_id: 'no-such-exercise',
          entry_date: '2026-10-15',
          duration_minutes: 30,
        },
        'user-1',
        'Manual',
        null,
        { skipDuplicateCheck: true }
      )
    ).rejects.toMatchObject({
      message: 'Exercise not found.',
      status: 404,
    });
  });
});
