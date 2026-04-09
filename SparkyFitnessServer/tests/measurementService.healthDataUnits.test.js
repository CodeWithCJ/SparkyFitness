import { beforeEach, describe, expect, it, vi } from 'vitest';
import measurementRepository from '../models/measurementRepository.js';
import measurementService from '../services/measurementService.js';
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
    measurementRepository.getCustomCategories = vi.fn().mockResolvedValue([]);
    measurementRepository.createCustomCategory = vi
      .fn()
      .mockResolvedValue({ id: 'cat-new' });
    measurementRepository.upsertCustomMeasurement = vi
      .fn()
      .mockResolvedValue({ id: 'entry-1' });
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
      measurementRepository.createCustomCategory.mock.calls[0][0];
    expect(createPayload.measurement_type).toBe('m');
  });
});
describe('Aggregated health metric default units', () => {
  const userId = 'user-123';
  const actingUserId = 'user-123';
  beforeEach(() => {
    vi.clearAllMocks();
    measurementRepository.getCustomCategories = vi.fn().mockResolvedValue([]);
    measurementRepository.createCustomCategory = vi
      .fn()
      .mockResolvedValue({ id: 'cat-new' });
    measurementRepository.upsertCustomMeasurement = vi
      .fn()
      .mockResolvedValue({ id: 'entry-1' });
  });
  it.each([
    // Chunk 1: Heart rate + vitals
    ['heart_rate_min', 'bpm'],
    ['heart_rate_max', 'bpm'],
    ['heart_rate_avg', 'bpm'],
    ['blood_glucose_avg', 'mmol/L'],
    ['blood_oxygen_saturation_min', 'percent'],
    ['respiratory_rate_max', 'breaths/min'],
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
      measurementRepository.createCustomCategory.mock.calls[0][0];
    expect(createPayload.measurement_type).toBe(expectedUnit);
    expect(createPayload.name).toBe(type);
  });
});
describe('processMobileHealthData aggregated types', () => {
  const userId = 'user-123';
  const actingUserId = 'user-123';
  beforeEach(() => {
    vi.clearAllMocks();
    measurementRepository.getCustomCategories = vi.fn().mockResolvedValue([]);
    measurementRepository.createCustomCategory = vi
      .fn()
      .mockResolvedValue({ id: 'cat-new' });
    measurementRepository.upsertCustomMeasurement = vi
      .fn()
      .mockResolvedValue({ id: 'entry-1' });
  });
  it('stores aggregated type as custom measurement via mobile path', async () => {
    const mobileData = [
      {
        type: 'running_speed_avg',
        value: 3.5,
        source: 'apple_health',
        timestamp: '2025-06-01T10:00:00Z',
      },
    ];
    const result = await measurementService.processMobileHealthData(
      mobileData,
      userId,
      actingUserId
    );
    expect(result.processed).toHaveLength(1);
    expect(result.processed[0]).toMatchObject({
      type: 'running_speed_avg',
      status: 'success',
    });
    expect(measurementRepository.createCustomCategory).toHaveBeenCalledTimes(1);
    const createPayload =
      measurementRepository.createCustomCategory.mock.calls[0][0];
    expect(createPayload.name).toBe('running_speed_avg');
    expect(createPayload.measurement_type).toBe('m/s');
    expect(measurementRepository.upsertCustomMeasurement).toHaveBeenCalledTimes(
      1
    );
    expect(measurementRepository.upsertCustomMeasurement).toHaveBeenCalledWith(
      userId,
      actingUserId,
      'cat-new',
      3.5,
      '2025-06-01',
      expect.any(Number),
      '2025-06-01T10:00:00.000Z',
      undefined,
      'Daily',
      'apple_health'
    );
  });
  it('uses payload unit over default when provided', async () => {
    const mobileData = [
      {
        type: 'running_speed_avg',
        value: 8.5,
        unit: 'km/h',
        source: 'apple_health',
        timestamp: '2025-06-01T10:00:00Z',
      },
    ];
    const result = await measurementService.processMobileHealthData(
      mobileData,
      userId,
      actingUserId
    );
    expect(result.processed).toHaveLength(1);
    const createPayload =
      measurementRepository.createCustomCategory.mock.calls[0][0];
    expect(createPayload.measurement_type).toBe('km/h');
  });
  it('rejects entry with non-numeric value', async () => {
    const mobileData = [
      {
        type: 'running_speed_avg',
        value: 'not-a-number',
        source: 'apple_health',
        timestamp: '2025-06-01T10:00:00Z',
      },
    ];
    await expect(
      measurementService.processMobileHealthData(
        mobileData,
        userId,
        actingUserId
      )
    ).rejects.toThrow();
    expect(
      measurementRepository.upsertCustomMeasurement
    ).not.toHaveBeenCalled();
  });
  it('handles multiple aggregated entries in one batch', async () => {
    const mobileData = [
      {
        type: 'running_speed_min',
        value: 2.8,
        source: 'apple_health',
        timestamp: '2025-06-01T10:00:00Z',
      },
      {
        type: 'running_speed_max',
        value: 4.2,
        source: 'apple_health',
        timestamp: '2025-06-01T10:00:00Z',
      },
      {
        type: 'running_speed_avg',
        value: 3.5,
        source: 'apple_health',
        timestamp: '2025-06-01T10:00:00Z',
      },
    ];
    const result = await measurementService.processMobileHealthData(
      mobileData,
      userId,
      actingUserId
    );
    expect(result.processed).toHaveLength(3);
    expect(measurementRepository.upsertCustomMeasurement).toHaveBeenCalledTimes(
      3
    );
  });
  it('passes notes through when provided', async () => {
    const mobileData = [
      {
        type: 'cycling_ftp',
        value: 250,
        source: 'apple_health',
        timestamp: '2025-06-01T10:00:00Z',
        notes: 'New FTP test result',
      },
    ];
    const result = await measurementService.processMobileHealthData(
      mobileData,
      userId,
      actingUserId
    );
    expect(result.processed).toHaveLength(1);
    expect(measurementRepository.upsertCustomMeasurement).toHaveBeenCalledWith(
      userId,
      actingUserId,
      'cat-new',
      250,
      '2025-06-01',
      expect.any(Number),
      '2025-06-01T10:00:00.000Z',
      'New FTP test result',
      'Daily',
      'apple_health'
    );
  });
  it('reuses existing custom category instead of creating a new one', async () => {
    measurementRepository.getCustomCategories = vi.fn().mockResolvedValue([
      {
        id: 'cat-existing',
        name: 'running_speed_avg',
        measurement_type: 'm/s',
        frequency: 'Daily',
        data_type: 'numeric',
      },
    ]);
    const mobileData = [
      {
        type: 'running_speed_avg',
        value: 3.5,
        source: 'apple_health',
        timestamp: '2025-06-01T10:00:00Z',
      },
    ];
    const result = await measurementService.processMobileHealthData(
      mobileData,
      userId,
      actingUserId
    );
    expect(result.processed).toHaveLength(1);
    expect(measurementRepository.createCustomCategory).not.toHaveBeenCalled();
    expect(measurementRepository.upsertCustomMeasurement).toHaveBeenCalledWith(
      userId,
      actingUserId,
      'cat-existing',
      3.5,
      '2025-06-01',
      expect.any(Number),
      '2025-06-01T10:00:00.000Z',
      undefined,
      'Daily',
      'apple_health'
    );
  });
});
