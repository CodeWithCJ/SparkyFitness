import { describe, expect, it } from 'vitest';
import { getGarminSyncPhaseErrors } from '../services/garminSyncResult.js';

describe('getGarminSyncPhaseErrors', () => {
  it('returns phases with top-level sync errors', () => {
    const result = {
      health: { error: 'health unavailable' },
      activities: { processedEntries: 2 },
      nutrition: { error: 'nutrition unavailable' },
    };

    expect(getGarminSyncPhaseErrors(result)).toEqual(['health', 'nutrition']);
  });

  it('does not treat nested processing errors as phase failures', () => {
    const result = {
      health: { processedEntries: 1 },
      activities: { processedEntries: 2 },
      nutrition: { errors: [{ message: 'one food entry skipped' }] },
    };

    expect(getGarminSyncPhaseErrors(result)).toEqual([]);
  });
});
