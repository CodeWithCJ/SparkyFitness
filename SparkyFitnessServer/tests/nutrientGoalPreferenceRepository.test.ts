import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import nutrientGoalPreferenceRepository from '../models/nutrientGoalPreferenceRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

describe('nutrientGoalPreferenceRepository.renameNutrientGoalPreferenceKey', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;
  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
    // @ts-expect-error mock typing
    getClient.mockResolvedValue(mockClient);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('wraps the UPDATE + DELETE pair in a transaction and releases the client', async () => {
    await nutrientGoalPreferenceRepository.renameNutrientGoalPreferenceKey(
      'user-1',
      'Sugar',
      'Added Sugars'
    );

    const calls = mockClient.query.mock.calls.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (call: any[]) => call[0]
    );
    expect(calls[0]).toBe('BEGIN');
    expect(calls[1]).toContain('UPDATE');
    expect(calls[2]).toContain('DELETE');
    expect(calls[3]).toBe('COMMIT');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and rethrows if the DELETE fails, without leaving the client held', async () => {
    mockClient.query.mockImplementation((sql: string) => {
      if (sql.includes('DELETE')) {
        return Promise.reject(new Error('delete failed'));
      }
      return Promise.resolve({ rows: [] });
    });

    await expect(
      nutrientGoalPreferenceRepository.renameNutrientGoalPreferenceKey(
        'user-1',
        'Sugar',
        'Added Sugars'
      )
    ).rejects.toThrow('delete failed');

    const calls = mockClient.query.mock.calls.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (call: any[]) => call[0]
    );
    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});
