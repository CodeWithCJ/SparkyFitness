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

  it('treats partialErrors as phase failures to prevent advancing last_sync_at on incomplete syncs', () => {
    const result = {
      health: {
        processedEntries: 5,
        partialErrors: ['[2026-08-01..2026-08-07]: ECONNRESET'],
      },
      activities: { processedEntries: 10 },
      nutrition: { processedEntries: 3 },
    };

    expect(getGarminSyncPhaseErrors(result)).toEqual(['health']);
  });
});
