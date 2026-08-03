import { beforeEach, describe, expect, it, vi } from 'vitest';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import { getClient } from '../db/poolManager.js';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: vi.fn(),
    };
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

    const [selectSql, params] = mockClient.query.mock.calls[1];
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
