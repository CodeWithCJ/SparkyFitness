import { beforeEach, describe, expect, it, vi } from 'vitest';
import measurementRepository from '../models/measurementRepository.js';
import measurementService from '../services/measurementService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn(),
}));
vi.mock('../models/measurementRepository');
vi.mock('../models/userRepository');
vi.mock('../models/exerciseRepository');
vi.mock('../models/exerciseEntry');
vi.mock('../models/sleepRepository');
vi.mock('../models/waterContainerRepository');
vi.mock('../models/activityDetailsRepository');

// Muscle mass, bone mass, and body water used to have no handler, so every
// provider's values fell through to auto-created custom_measurements
// categories. They now share the check-in write path with weight and body fat.
describe('smart-scale composition routes to check_in_measurements', () => {
  const userId = 'user-123';
  const actingUserId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadUserTimezone).mockResolvedValue('UTC');
    measurementRepository.getCustomCategories = vi.fn().mockResolvedValue([]);
    measurementRepository.createCustomCategory = vi
      .fn()
      .mockResolvedValue({ id: 'cat-new' });
    measurementRepository.bulkUpsertCustomMeasurements = vi
      .fn()
      .mockResolvedValue([{ id: 'entry-1' }]);
    measurementRepository.bulkUpsertCheckInMeasurements = vi
      .fn()
      .mockResolvedValue([{ id: 'checkin-1' }]);
  });

  const checkInWrites = () =>
    // @ts-expect-error vi.fn() assignment above is untyped on the repository
    measurementRepository.bulkUpsertCheckInMeasurements.mock.calls[0][2];

  it('writes Garmin column-named types into their check-in columns', async () => {
    await measurementService.processHealthData(
      [
        {
          type: 'muscle_mass_kg',
          value: 34.2,
          date: '2026-07-30',
          source: 'garmin',
        },
        {
          type: 'bone_mass_kg',
          value: 3.1,
          date: '2026-07-30',
          source: 'garmin',
        },
        {
          type: 'body_water_percentage',
          value: 55.4,
          date: '2026-07-30',
          source: 'garmin',
        },
      ],
      userId,
      actingUserId
    );

    expect(
      measurementRepository.bulkUpsertCheckInMeasurements
    ).toHaveBeenCalledTimes(1);
    expect(
      checkInWrites().map((w: { measurements: unknown }) => w.measurements)
    ).toEqual([
      { muscle_mass_kg: 34.2 },
      { bone_mass_kg: 3.1 },
      { body_water_percentage: 55.4 },
    ]);
    expect(
      measurementRepository.bulkUpsertCustomMeasurements
    ).not.toHaveBeenCalled();
  });

  it('maps Health Connect bone mass spellings onto bone_mass_kg', async () => {
    await measurementService.processHealthData(
      [
        {
          type: 'BoneMass',
          value: 3.4,
          date: '2026-07-30',
          source: 'HealthConnect',
        },
        {
          type: 'bone_mass',
          value: 3.5,
          date: '2026-07-31',
          source: 'HealthConnect',
        },
      ],
      userId,
      actingUserId
    );

    expect(
      checkInWrites().map((w: { measurements: unknown }) => w.measurements)
    ).toEqual([{ bone_mass_kg: 3.4 }, { bone_mass_kg: 3.5 }]);
  });

  it('keeps lean body mass as a custom measurement', async () => {
    await measurementService.processHealthData(
      [
        {
          type: 'lean_body_mass',
          value: 60,
          date: '2026-07-30',
          source: 'HealthConnect',
        },
      ],
      userId,
      actingUserId
    );

    expect(
      measurementRepository.bulkUpsertCheckInMeasurements
    ).not.toHaveBeenCalled();
    expect(
      measurementRepository.bulkUpsertCustomMeasurements
    ).toHaveBeenCalledTimes(1);
  });

  it('rejects an out-of-range body water percentage instead of storing it', async () => {
    const result = await measurementService.processHealthData(
      [
        {
          type: 'body_water_percentage',
          value: 155,
          date: '2026-07-30',
          source: 'garmin',
        },
      ],
      userId,
      actingUserId
    );

    expect(
      measurementRepository.bulkUpsertCheckInMeasurements
    ).not.toHaveBeenCalled();
    expect(result.errors.length).toBe(1);
  });
});
