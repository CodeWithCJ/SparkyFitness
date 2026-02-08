/**
 * Tests for health data processing default units (fix for #567).
 * When HealthConnect (or other clients) send data without a unit, the server
 * should apply default units so the UI does not show "N/A".
 *
 * Run with: npx jest tests/measurementService.healthDataUnits.test.js
 * (Server tests may require SPARKY_FITNESS_API_ENCRYPTION_KEY set to a 64-char hex string.)
 */
const measurementRepository = require('../models/measurementRepository');
const measurementService = require('../services/measurementService');

jest.mock('../models/measurementRepository');
jest.mock('../models/userRepository');
jest.mock('../models/exerciseRepository');
jest.mock('../models/exerciseEntry');
jest.mock('../models/sleepRepository');
jest.mock('../models/waterContainerRepository');
jest.mock('../models/activityDetailsRepository');

describe('processHealthData default units (#567)', () => {
  const userId = 'user-123';
  const actingUserId = 'user-123';

  beforeEach(() => {
    jest.clearAllMocks();
    measurementRepository.getCustomCategories = jest.fn().mockResolvedValue([]);
    measurementRepository.createCustomCategory = jest.fn().mockResolvedValue({ id: 'cat-new' });
    measurementRepository.upsertCustomMeasurement = jest.fn().mockResolvedValue({ id: 'entry-1' });
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

    await measurementService.processHealthData(healthDataArray, userId, actingUserId);

    expect(measurementRepository.createCustomCategory).toHaveBeenCalledTimes(1);
    const createPayload = measurementRepository.createCustomCategory.mock.calls[0][0];
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

    await measurementService.processHealthData(healthDataArray, userId, actingUserId);

    expect(measurementRepository.createCustomCategory).toHaveBeenCalledTimes(1);
    const createPayload = measurementRepository.createCustomCategory.mock.calls[0][0];
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

    await measurementService.processHealthData(healthDataArray, userId, actingUserId);

    expect(measurementRepository.createCustomCategory).toHaveBeenCalledTimes(1);
    const createPayload = measurementRepository.createCustomCategory.mock.calls[0][0];
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

    await measurementService.processHealthData(healthDataArray, userId, actingUserId);

    expect(measurementRepository.createCustomCategory).toHaveBeenCalledTimes(1);
    const createPayload = measurementRepository.createCustomCategory.mock.calls[0][0];
    expect(createPayload.measurement_type).toBe('m');
  });
});
