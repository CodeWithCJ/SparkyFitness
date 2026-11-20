import { vi, beforeEach, describe, it, expect } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [] }),
    release: vi.fn(),
  },
}));

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn().mockResolvedValue(mockClient),
  getSystemClient: vi.fn().mockResolvedValue(mockClient),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import exerciseRepository from '../models/exercise.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fillEmptyMuscles', () => {
  it('writes only while primary muscles are empty and keeps saved secondary muscles', async () => {
    mockClient.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        { primary_muscles: '["chest"]', secondary_muscles: '["triceps"]' },
      ],
    });
    const changed = await exerciseRepository.fillEmptyMuscles(
      'user-1',
      'exercise-1',
      ['chest'],
      ['triceps']
    );

    expect(changed).toEqual({
      primary_muscles: '["chest"]',
      secondary_muscles: '["triceps"]',
    });
    const [sql, params] = mockClient.query.mock.calls[0]!;
    // Emptiness is checked in the statement itself, not from a snapshot.
    expect(sql).toMatch(
      /WHERE id = \$3 AND user_id = \$4\s+AND regexp_replace\(COALESCE\(primary_muscles/
    );
    expect(sql).toMatch(
      /secondary_muscles = CASE WHEN regexp_replace\(COALESCE\(secondary_muscles.*THEN \$2 ELSE secondary_muscles END/s
    );
    expect(sql).toMatch(/RETURNING primary_muscles, secondary_muscles/);
    expect(params).toEqual([
      '["chest"]',
      '["triceps"]',
      'exercise-1',
      'user-1',
    ]);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('reports no change when the row already has muscles', async () => {
    mockClient.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(
      exerciseRepository.fillEmptyMuscles('user-1', 'exercise-1', ['chest'], [])
    ).resolves.toBeNull();
  });

  it('does nothing without primary muscles', async () => {
    await expect(
      exerciseRepository.fillEmptyMuscles('user-1', 'exercise-1', [], ['chest'])
    ).resolves.toBeNull();
    expect(mockClient.query).not.toHaveBeenCalled();
  });
});
