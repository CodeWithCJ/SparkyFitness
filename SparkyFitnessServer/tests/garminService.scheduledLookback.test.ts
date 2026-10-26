import { vi, afterEach, beforeEach, describe, it, expect } from 'vitest';
import { todayInZone, addDays } from '@workspace/shared';

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
    .mockResolvedValue({ processedEntries: 0 }),
}));
vi.mock('../services/garmin/garminActivityProcessor.js', () => ({
  processActivitiesAndWorkouts: vi
    .fn()
    .mockResolvedValue({ processedEntries: 0, failedDefinitions: 0 }),
  processGarminWorkoutSession: vi.fn(),
  processGarminWorkoutDefinition: vi.fn(),
  processGarminSimpleActivity: vi.fn(),
}));

import garminConnectService from '../integrations/garminconnect/garminConnectService.js';
import { syncGarminData } from '../services/garminService.js';

describe('Garmin syncGarminData - scheduled sync look-back window', () => {
  let chunkSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(
      garminConnectService,
      'fetchGarminHealthAndWellnessChunk'
    ).mockResolvedValue({ data: {} });
    vi.spyOn(
      garminConnectService,
      'fetchGarminActivitiesAndWorkoutsChunk'
    ).mockResolvedValue({ activities: [], workouts: [] });
    vi.spyOn(
      garminConnectService,
      'fetchGarminNutritionDiaryChunk'
    ).mockResolvedValue({ nutrition_data: [] });

    // Call-through spy: the real chunking still runs, we only read the range it was asked for.
    chunkSpy = vi.spyOn(garminConnectService, 'getGarminDateChunks');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const requestedRange = () => {
    expect(chunkSpy).toHaveBeenCalledTimes(1);
    const [start, end] = chunkSpy.mock.calls[0] as [string, string, number];
    return { start, end };
  };

  it('re-requests the last three days', async () => {
    const today = todayInZone('UTC');

    await syncGarminData('user-1', 'scheduled');

    expect(requestedRange()).toEqual({ start: addDays(today, -3), end: today });
  });

  it('leaves the manual seven day window unchanged', async () => {
    const today = todayInZone('UTC');

    await syncGarminData('user-1', 'manual');

    expect(requestedRange()).toEqual({ start: addDays(today, -7), end: today });
  });
});
