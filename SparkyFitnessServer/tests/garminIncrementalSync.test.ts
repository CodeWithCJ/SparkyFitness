import { vi, beforeEach, describe, it, expect } from 'vitest';

vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../services/measurementService.js', () => ({
  default: {
    processHealthData: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('../services/garmin/garminHealthProcessor.js', () => ({
  processGarminHealthAndWellnessData: vi.fn().mockResolvedValue({}),
  processGarminSleepData: vi.fn().mockResolvedValue({}),
  processGarminNutritionData: vi
    .fn()
    .mockResolvedValue({ processedEntries: 5 }),
}));
vi.mock('../services/garmin/garminActivityProcessor.js', () => ({
  processActivitiesAndWorkouts: vi
    .fn()
    .mockResolvedValue({ processedEntries: 3 }),
  processGarminWorkoutSession: vi.fn(),
  processGarminWorkoutDefinition: vi.fn(),
  processGarminSimpleActivity: vi.fn(),
}));

import garminConnectService from '../integrations/garminconnect/garminConnectService.js';
import { syncGarminData } from '../services/garminService.js';

describe('Garmin syncGarminData - Incremental Chunk Resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('continues processing remaining chunks and records partialErrors when one chunk fails', async () => {
    // Mock chunk fetches: chunk 1 succeeds, chunk 2 fails on activities, chunk 3 succeeds
    vi.spyOn(
      garminConnectService,
      'fetchGarminActivitiesAndWorkoutsChunk'
    ).mockImplementation((_userId, start) => {
      if (start === '2026-08-08') {
        return Promise.reject(new Error('Connection reset on chunk 2'));
      }
      return Promise.resolve({
        activities: [{ activityId: 1 }],
        workouts: [],
      });
    });

    vi.spyOn(
      garminConnectService,
      'fetchGarminHealthAndWellnessChunk'
    ).mockResolvedValue({ data: {} });

    vi.spyOn(
      garminConnectService,
      'fetchGarminNutritionDiaryChunk'
    ).mockResolvedValue({ nutrition_data: [] });

    const result = await syncGarminData(
      'user-1',
      'manual',
      '2026-08-01',
      '2026-08-15'
    );

    // Range is 3 chunks: [08-01..08-07], [08-08..08-14], [08-15..08-15]
    // Activities: chunks 1 and 3 processed (3 entries each = 6 total), chunk 2 failed with partialErrors
    expect(result.activities).not.toBeNull();
    expect(result.activities?.processedEntries).toBe(6);
    expect(result.activities?.partialErrors).toBeDefined();
    const partialErrors = result.activities?.partialErrors as
      | string[]
      | undefined;
    expect(partialErrors).toHaveLength(1);
    expect(partialErrors?.[0]).toContain('Connection reset on chunk 2');
  });

  it('marks phase with error if all chunks fail in that phase', async () => {
    vi.spyOn(
      garminConnectService,
      'fetchGarminActivitiesAndWorkoutsChunk'
    ).mockRejectedValue(new Error('Garmin API 500 error'));

    vi.spyOn(
      garminConnectService,
      'fetchGarminHealthAndWellnessChunk'
    ).mockResolvedValue({ data: {} });

    vi.spyOn(
      garminConnectService,
      'fetchGarminNutritionDiaryChunk'
    ).mockResolvedValue({ nutrition_data: [] });

    const result = await syncGarminData(
      'user-1',
      'manual',
      '2026-08-01',
      '2026-08-07'
    );

    expect(result.activities).not.toBeNull();
    expect(result.activities?.error).toBeDefined();
    expect(result.activities?.error).toContain('Garmin API 500 error');
  });
});
