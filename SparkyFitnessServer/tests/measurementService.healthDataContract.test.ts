import { beforeEach, describe, expect, it, vi } from 'vitest';
import measurementRepository from '../models/measurementRepository.js';
import measurementService from '../services/measurementService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn(),
}));
vi.mock('../models/measurementRepository');
vi.mock('../models/userRepository');
vi.mock('../models/exercise');
vi.mock('../models/exerciseEntry');
vi.mock('../models/sleepRepository');
vi.mock('../models/waterContainerRepository');
vi.mock('../models/activityDetailsRepository');
vi.mock('../models/foodRepository');

// Canonical regression for the per-record error contract: one poison record
// must never fail the whole batch (the pre-contract behavior threw a
// stringified JSON error, the route 400'd, and mobile re-synced the same
// window forever). processHealthData resolves with per-record outcomes.
describe('processHealthData per-record error contract', () => {
  const userId = 'user-123';
  const actingUserId = 'user-123';
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadUserTimezone).mockResolvedValue('UTC');
    measurementRepository.bulkUpsertCheckInMeasurements = vi
      .fn()
      .mockResolvedValue([
        { id: 'check-in-1', steps: 5000, weight: 70.5 },
        { id: 'check-in-1', steps: 5000, weight: 70.5 },
      ]);
  });

  it('resolves with per-record outcomes when a poison record is in the batch', async () => {
    const poisonEntry = {
      type: 'step',
      value: 'not-a-number',
      date: '2025-02-01',
      source: 'HealthKit',
    };
    const result = await measurementService.processHealthData(
      [
        { type: 'step', value: 5000, date: '2025-02-01', source: 'HealthKit' },
        poisonEntry,
        {
          type: 'weight',
          value: 70.5,
          date: '2025-02-01',
          source: 'HealthKit',
        },
      ],
      userId,
      actingUserId
    );

    expect(result.processed).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].entry).toEqual(poisonEntry);
    expect(result.errors[0].error).toBe(
      'Invalid value for step. Must be an integer.'
    );
    expect(result.message).toBe(
      'Some health data entries could not be processed.'
    );
    // The valid records around the poison one were still written, and the
    // poison record was excluded from the write.
    expect(
      measurementRepository.bulkUpsertCheckInMeasurements
    ).toHaveBeenCalledTimes(1);
    expect(
      measurementRepository.bulkUpsertCheckInMeasurements
    ).toHaveBeenCalledWith(userId, actingUserId, [
      { entryDate: '2025-02-01', measurements: { steps: 5000 } },
      { entryDate: '2025-02-01', measurements: { weight: 70.5 } },
    ]);
  });

  it('always includes errors and skipped arrays, even on full success', async () => {
    const result = await measurementService.processHealthData(
      [{ type: 'step', value: 5000, date: '2025-02-01', source: 'HealthKit' }],
      userId,
      actingUserId
    );

    expect(result.message).toBe('All health data successfully processed.');
    expect(result.processed).toHaveLength(1);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('reports Nutrition records without source_id in skipped, not errors', async () => {
    const nutritionEntry = {
      type: 'Nutrition',
      food_name: 'Banana',
      calories: 105,
      date: '2025-02-01',
      source: 'Health Connect',
    };
    const result = await measurementService.processHealthData(
      [
        nutritionEntry,
        { type: 'step', value: 5000, date: '2025-02-01', source: 'HealthKit' },
      ],
      userId,
      actingUserId
    );

    expect(result.processed).toHaveLength(1);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].entry).toEqual(nutritionEntry);
    expect(result.skipped[0].reason).toContain('source_id');
    // Skips do not fail the batch.
    expect(result.message).toBe('All health data successfully processed.');
  });
});
