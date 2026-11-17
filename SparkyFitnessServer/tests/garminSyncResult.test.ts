import { describe, expect, it } from 'vitest';
import {
  getGarminSyncPhaseErrors,
  isGarminServiceUnreachable,
} from '../services/garminSyncResult.js';

describe('isGarminServiceUnreachable', () => {
  it.each(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'])(
    'is true when a failed phase reports %s',
    (code) => {
      expect(
        isGarminServiceUnreachable({
          health: { error: `[2026-08-01..2026-08-07]: connect ${code}` },
          activities: { processedEntries: 1 },
          nutrition: null,
        })
      ).toBe(true);
    }
  );

  it('also reads partialErrors', () => {
    expect(
      isGarminServiceUnreachable({
        health: { processedEntries: 1 },
        activities: {
          processedEntries: 1,
          partialErrors: ['[2026-08-01..2026-08-07]: ETIMEDOUT'],
        },
        nutrition: null,
      })
    ).toBe(true);
  });

  it('is false for other errors and for a clean sync', () => {
    expect(
      isGarminServiceUnreachable({
        health: { error: 'Garmin health API rate limited' },
        activities: { processedEntries: 1 },
        nutrition: { processedEntries: 1 },
      })
    ).toBe(false);
    expect(
      isGarminServiceUnreachable({
        health: { processedEntries: 1 },
        activities: { processedEntries: 1 },
        nutrition: { processedEntries: 1 },
      })
    ).toBe(false);
  });
});

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
