import { vi, beforeEach, describe, expect, it } from 'vitest';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import { getClient } from '../db/poolManager.js';
import { setExerciseEntryEffort } from '../services/exerciseEntryService.js';

vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../db/poolManager', () => ({ getClient: vi.fn() }));
vi.mock('../models/exercise', () => ({ default: {} }));
vi.mock('../models/exerciseEntry', () => ({
  default: { getExerciseEntryOwnerId: vi.fn() },
}));
vi.mock('../models/workoutPresetRepository', () => ({ default: {} }));
vi.mock('../models/activityDetailsRepository', () => ({ default: {} }));
vi.mock('../models/preferenceRepository', () => ({ default: {} }));
vi.mock('../models/userRepository', () => ({ default: {} }));
vi.mock('../models/workoutTelemetryRepository', () => ({}));

const userId = 'user-1';
const entryId = 'entry-1';
const client = { query: vi.fn(), release: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue(client as never);
  client.query.mockResolvedValue({ rows: [] });
  vi.mocked(exerciseEntryRepository.getExerciseEntryOwnerId).mockResolvedValue(
    userId
  );
});

describe('setExerciseEntryEffort', () => {
  it('writes the rating for the entry and its strength session, as the acting user', async () => {
    await setExerciseEntryEffort(userId, 'actor-1', entryId, { rating: 8 });

    expect(getClient).toHaveBeenCalledWith(userId, 'actor-1');
    expect(client.query).toHaveBeenCalledTimes(1);
    const [sql, params] = client.query.mock.calls[0];
    expect(String(sql)).toContain('UPDATE exercise_entries SET workout_effort');
    expect(String(sql)).toContain('exercise_preset_entry_id');
    expect(params).toEqual([entryId, 8, userId]);
    expect(client.release).toHaveBeenCalled();
  });

  it("refuses an entry that is not the caller's, writing nothing", async () => {
    vi.mocked(
      exerciseEntryRepository.getExerciseEntryOwnerId
    ).mockResolvedValue('someone-else');

    await expect(
      setExerciseEntryEffort(userId, 'actor-1', entryId, { rating: 8 })
    ).rejects.toMatchObject({ status: 404 });
    expect(client.query).not.toHaveBeenCalled();
  });

  it('refuses an entry that does not exist', async () => {
    vi.mocked(
      exerciseEntryRepository.getExerciseEntryOwnerId
    ).mockResolvedValue(undefined);

    await expect(
      setExerciseEntryEffort(userId, 'actor-1', entryId, { rating: 3 })
    ).rejects.toMatchObject({ status: 404 });
  });
});
