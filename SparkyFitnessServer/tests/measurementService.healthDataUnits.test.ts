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
describe('processHealthData default units (#567)', () => {
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
  });
  it('applies default unit when payload has no unit (e.g. heart_rate -> bpm)', async () => {
    const healthDataArray = [
      {
        type: 'heart_rate',
        value: 72,
        date: '2025-02-01',
        source: 'HealthConnect',
      },
    ];
    await measurementService.processHealthData(
      healthDataArray,
      userId,
      actingUserId
    );
    expect(measurementRepository.createCustomCategory).toHaveBeenCalledTimes(1);
    const createPayload =
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '(categoryD... Remove this comment to see the full error message
      measurementRepository.createCustomCategory.mock.calls[0][0];
    expect(createPayload.measurement_type).toBe('bpm');
    expect(createPayload.name).toBe('heart_rate');
  });
  it('uses payload unit when provided', async () => {
    const healthDataArray = [
      {
        type: 'heart_rate',
        value: 72,
        date: '2025-02-01',
        source: 'HealthConnect',
        unit: 'beats/min',
      },
    ];
    await measurementService.processHealthData(
      healthDataArray,
      userId,
      actingUserId
    );
    expect(measurementRepository.createCustomCategory).toHaveBeenCalledTimes(1);
    const createPayload =
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '(categoryD... Remove this comment to see the full error message
      measurementRepository.createCustomCategory.mock.calls[0][0];
    expect(createPayload.measurement_type).toBe('beats/min');
  });
  it('applies default unit for TotalCaloriesBurned when unit missing', async () => {
    const healthDataArray = [
      {
        type: 'TotalCaloriesBurned',
        value: 2100,
        date: '2025-02-01',
        source: 'HealthConnect',
      },
    ];
    await measurementService.processHealthData(
      healthDataArray,
      userId,
      actingUserId
    );
    expect(measurementRepository.createCustomCategory).toHaveBeenCalledTimes(1);
    const createPayload =
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '(categoryD... Remove this comment to see the full error message
      measurementRepository.createCustomCategory.mock.calls[0][0];
    expect(createPayload.measurement_type).toBe('kcal');
  });
  it('applies default unit for distance when unit missing', async () => {
    const healthDataArray = [
      {
        type: 'distance',
        value: 5000,
        date: '2025-02-01',
        source: 'HealthConnect',
      },
    ];
    await measurementService.processHealthData(
      healthDataArray,
      userId,
      actingUserId
    );
    expect(measurementRepository.createCustomCategory).toHaveBeenCalledTimes(1);
    const createPayload =
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '(categoryD... Remove this comment to see the full error message
      measurementRepository.createCustomCategory.mock.calls[0][0];
    expect(createPayload.measurement_type).toBe('m');
  });
  it.each([
    ['Health Connect', 'height', 1.75, 'm', 175],
    ['HealthKit', 'height', 1.82, 'm', 182],
    ['HealthKit', 'Height', 180, 'cm', 180],
  ])(
    'stores %s %s in check-in measurements as centimeters',
    async (source, type, value, unit, expectedHeight) => {
      measurementRepository.bulkUpsertCheckInMeasurements = vi
        .fn()
        .mockResolvedValue([{ id: 'check-in-1', height: expectedHeight }]);

      const result = await measurementService.processHealthData(
        [
          {
            type,
            value,
            date: '2025-02-01',
            source,
            unit,
          },
        ],
        userId,
        actingUserId
      );

      expect(result.processed).toHaveLength(1);
      expect(
        measurementRepository.bulkUpsertCheckInMeasurements
      ).toHaveBeenCalledWith(userId, actingUserId, [
        { entryDate: '2025-02-01', measurements: { height: expectedHeight } },
      ]);
      expect(measurementRepository.createCustomCategory).not.toHaveBeenCalled();
      expect(
        measurementRepository.bulkUpsertCustomMeasurements
      ).not.toHaveBeenCalled();
    }
  );
  it('rejects height with an unsupported unit instead of guessing', async () => {
    measurementRepository.bulkUpsertCheckInMeasurements = vi.fn();

    const result = await measurementService.processHealthData(
      [
        {
          type: 'height',
          value: 70,
          date: '2025-02-01',
          source: 'HealthConnect',
          unit: 'inches',
        },
      ],
      userId,
      actingUserId
    );

    expect(result.processed).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toBe(
      'Invalid value for height. Must be a positive number in meters or centimeters.'
    );
    expect(
      measurementRepository.bulkUpsertCheckInMeasurements
    ).not.toHaveBeenCalled();
    expect(measurementRepository.createCustomCategory).not.toHaveBeenCalled();
    expect(
      measurementRepository.bulkUpsertCustomMeasurements
    ).not.toHaveBeenCalled();
  });

  it('stores Health Connect body_fat in check-in measurements as body_fat_percentage', async () => {
    measurementRepository.bulkUpsertCheckInMeasurements = vi
      .fn()
      .mockResolvedValue([{ id: 'check-in-1', body_fat_percentage: 18.4 }]);

    const result = await measurementService.processHealthData(
      [
        {
          type: 'body_fat',
          value: 18.4,
          date: '2025-02-01',
          source: 'HealthConnect',
          unit: '%',
        },
      ],
      userId,
      actingUserId
    );

    expect(result.processed).toHaveLength(1);
    expect(
      measurementRepository.bulkUpsertCheckInMeasurements
    ).toHaveBeenCalledWith(userId, actingUserId, [
      {
        entryDate: '2025-02-01',
        measurements: { body_fat_percentage: 18.4 },
      },
    ]);
    expect(measurementRepository.createCustomCategory).not.toHaveBeenCalled();
    expect(
      measurementRepository.bulkUpsertCustomMeasurements
    ).not.toHaveBeenCalled();
  });

  it('merges same-day check-in records into one bulk write', async () => {
    measurementRepository.bulkUpsertCheckInMeasurements = vi
      .fn()
      .mockResolvedValue([
        { id: 'check-in-1', steps: 5000, weight: 70.5 },
        { id: 'check-in-1', steps: 5000, weight: 70.5 },
      ]);

    const result = await measurementService.processHealthData(
      [
        { type: 'step', value: 5000, date: '2025-02-01', source: 'HealthKit' },
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
    // One write group, one repository call; the repo merges same-date rows.
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
});
describe('Aggregated health metric default units', () => {
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
  });
  it.each([
    // Chunk 1: Heart rate + vitals
    ['heart_rate_min', 'bpm'],
    ['heart_rate_max', 'bpm'],
    ['heart_rate_avg', 'bpm'],
    ['blood_glucose_avg', 'mmol/L'],
    ['blood_oxygen_saturation_min', 'percent'],
    ['respiratory_rate_max', 'breaths/min'],
    ['HRV', 'ms'],
    ['HRV_min', 'ms'],
    ['HRV_max', 'ms'],
    ['HRV_avg', 'ms'],
    ['HRV_SDNN', 'ms'],
    ['HRV_SDNN_min', 'ms'],
    ['HRV_SDNN_max', 'ms'],
    ['HRV_SDNN_avg', 'ms'],
    // Chunk 2: Running metrics
    ['running_speed_avg', 'm/s'],
    ['running_power_avg', 'W'],
    ['running_stride_length_min', 'cm'],
    ['running_ground_contact_max', 'ms'],
    ['running_vertical_oscillation_avg', 'cm'],
    // Chunk 3: Cycling metrics
    ['cycling_power_max', 'W'],
    ['cycling_cadence_avg', 'rpm'],
    ['cycling_speed_min', 'm/s'],
    // Chunk 4: Walking / mobility
    ['walking_speed_min', 'm/s'],
    ['walking_step_length_avg', 'cm'],
    ['walking_asymmetry_min', 'percent'],
    ['walking_double_support_max', 'percent'],
    ['steps_cadence_min', 'steps/min'],
    // Chunk 5: Sum types
    ['apple_move_time', 'seconds'],
    ['apple_exercise_time', 'seconds'],
    ['apple_stand_time', 'seconds'],
    ['dietary_protein', 'g'],
    ['dietary_sodium', 'mg'],
    // Chunk 6: Audio exposure
    ['environmental_audio_exposure_avg', 'dB'],
    ['headphone_audio_exposure_min', 'dB'],
    // Last types
    ['cycling_ftp', 'W'],
  ])('resolves default unit for %s to %s', async (type, expectedUnit) => {
    const healthDataArray = [
      { type, value: 42, date: '2025-06-01', source: 'apple_health' },
    ];
    await measurementService.processHealthData(
      healthDataArray,
      userId,
      actingUserId
    );
    expect(measurementRepository.createCustomCategory).toHaveBeenCalledTimes(1);
    const createPayload =
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '(categoryD... Remove this comment to see the full error message
      measurementRepository.createCustomCategory.mock.calls[0][0];
    expect(createPayload.measurement_type).toBe(expectedUnit);
    expect(createPayload.name).toBe(type);
  });
  it('rejects custom measurement entry with non-numeric value', async () => {
    const healthDataArray = [
      {
        type: 'running_speed_avg',
        value: 'not-a-number',
        source: 'apple_health',
        timestamp: '2025-06-01T10:00:00Z',
      },
    ];
    const result = await measurementService.processHealthData(
      healthDataArray,
      userId,
      actingUserId
    );
    expect(result.processed).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain(
      'Invalid numeric value for custom measurement type: running_speed_avg'
    );
    expect(
      measurementRepository.bulkUpsertCustomMeasurements
    ).not.toHaveBeenCalled();
  });
  it('passes notes through to the custom measurement write when provided', async () => {
    const healthDataArray = [
      {
        type: 'cycling_ftp',
        value: 250,
        source: 'apple_health',
        timestamp: '2025-06-01T10:00:00Z',
        notes: 'New FTP test result',
      },
    ];
    const result = await measurementService.processHealthData(
      healthDataArray,
      userId,
      actingUserId
    );
    expect(result.processed).toHaveLength(1);
    expect(
      measurementRepository.bulkUpsertCustomMeasurements
    ).toHaveBeenCalledWith(userId, actingUserId, [
      {
        categoryId: 'cat-new',
        value: 250,
        entryDate: '2025-06-01',
        entryHour: expect.any(Number),
        entryTimestamp: '2025-06-01T10:00:00.000Z',
        notes: 'New FTP test result',
        frequency: 'Daily',
        source: 'apple_health',
      },
    ]);
  });
  it('fetches categories once and writes once for a multi-record batch', async () => {
    measurementRepository.getCustomCategories = vi.fn().mockResolvedValue([
      {
        id: 'cat-existing',
        name: 'running_speed_avg',
        measurement_type: 'm/s',
        frequency: 'Daily',
        data_type: 'numeric',
      },
    ]);
    measurementRepository.bulkUpsertCustomMeasurements = vi
      .fn()
      .mockResolvedValue([{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }]);
    const healthDataArray = [
      {
        type: 'running_speed_avg',
        value: 3.1,
        date: '2025-06-01',
        source: 'apple_health',
      },
      {
        type: 'running_speed_avg',
        value: 3.2,
        date: '2025-06-02',
        source: 'apple_health',
      },
      {
        type: 'running_speed_avg',
        value: 3.3,
        date: '2025-06-03',
        source: 'apple_health',
      },
    ];
    const result = await measurementService.processHealthData(
      healthDataArray,
      userId,
      actingUserId
    );
    expect(result.processed).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
    // The request-scoped resolver fetches categories once per request, not
    // once per record (N+1 regression guard).
    expect(measurementRepository.getCustomCategories).toHaveBeenCalledTimes(1);
    // All three records flush through a single bulk write, in payload order.
    expect(
      measurementRepository.bulkUpsertCustomMeasurements
    ).toHaveBeenCalledTimes(1);
    const rows = vi.mocked(measurementRepository.bulkUpsertCustomMeasurements)
      .mock.calls[0][2];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(rows.map((row: any) => row.value)).toEqual([3.1, 3.2, 3.3]);
  });
});
