import { beforeEach, describe, expect, it, vi } from 'vitest';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import { getClient } from '../db/poolManager.js';
import { createMockDbClient } from './helpers/mockDbClient.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

vi.mock('../models/exercise', () => ({
  default: {},
}));

vi.mock('../models/activityDetailsRepository', () => ({
  default: {},
}));

describe('Garmin exercise cleanup', () => {
  let mockClient: ReturnType<typeof createMockDbClient>;

  beforeEach(() => {
    mockClient = createMockDbClient([]);
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  it('can preserve the synthetic Active Calories row', async () => {
    await exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDate(
      'user-1',
      '2026-08-02',
      '2026-08-02',
      'garmin',
      'Active Calories'
    );

    const lockCall = mockClient.query.mock.calls.find(([sql]) =>
      String(sql).includes('pg_advisory_xact_lock')
    );
    expect(lockCall?.[1]).toEqual(['exercise-entry-sync:user-1:garmin']);

    const [selectSql, params] = mockClient.query.mock.calls.find(([sql]) =>
      String(sql).includes('SELECT id FROM exercise_entries')
    )!;
    expect(selectSql).toContain('NOT EXISTS');
    expect(selectSql).toContain('exercises');
    expect(params).toEqual([
      'user-1',
      '2026-08-02',
      '2026-08-02',
      'garmin',
      'Active Calories',
    ]);
  });
});
