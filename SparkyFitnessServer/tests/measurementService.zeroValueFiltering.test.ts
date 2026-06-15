import { vi, beforeEach, describe, expect, it } from 'vitest';
import measurementService from '../services/measurementService.js';
import measurementRepository from '../models/measurementRepository.js';

vi.mock('../models/measurementRepository');

describe('Measurement Service - getCheckInMeasurements zero-value filtering', () => {
  const userId = 'user-123';
  const date = '2026-06-12';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns resolved measurements from the repository', async () => {
    const row = {
      id: '1',
      user_id: userId,
      entry_date: date,
      weight: 80,
      height: 180,
      waist: 85,
      neck: 38,
      hips: 95,
      body_fat_percentage: 18,
      steps: 5000,
    };
    // @ts-expect-error mock
    measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate.mockResolvedValue(
      row
    );

    const result = await measurementService.getCheckInMeasurements(
      userId,
      userId,
      date
    );

    expect(result.weight).toBe(80);
    expect(result.height).toBe(180);
    expect(result.body_fat_percentage).toBe(18);
    expect(result.steps).toBe(5000);
  });

  it('nullifies zero values for body measurement fields', async () => {
    const row = {
      id: '2',
      user_id: userId,
      entry_date: date,
      weight: 0,
      height: 0,
      waist: 0,
      neck: 0,
      hips: 0,
      body_fat_percentage: 0,
      steps: 8000,
    };
    // @ts-expect-error mock
    measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate.mockResolvedValue(
      row
    );

    const result = await measurementService.getCheckInMeasurements(
      userId,
      userId,
      date
    );

    expect(result.weight).toBeNull();
    expect(result.height).toBeNull();
    expect(result.waist).toBeNull();
    expect(result.neck).toBeNull();
    expect(result.hips).toBeNull();
    expect(result.body_fat_percentage).toBeNull();
    expect(result.steps).toBe(8000);
  });

  it('returns empty object when no measurements exist', async () => {
    // @ts-expect-error mock
    measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate.mockResolvedValue(
      null
    );

    const result = await measurementService.getCheckInMeasurements(
      userId,
      userId,
      date
    );

    expect(result).toEqual({});
  });

  it('preserves valid values and only nullifies zeros', async () => {
    const row = {
      id: '3',
      user_id: userId,
      entry_date: date,
      weight: 80,
      height: 0,
      waist: 85,
      neck: null,
      hips: 95,
      body_fat_percentage: 0,
      steps: null,
    };
    // @ts-expect-error mock
    measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate.mockResolvedValue(
      row
    );

    const result = await measurementService.getCheckInMeasurements(
      userId,
      userId,
      date
    );

    expect(result.weight).toBe(80);
    expect(result.height).toBeNull();
    expect(result.waist).toBe(85);
    expect(result.neck).toBeNull();
    expect(result.hips).toBe(95);
    expect(result.body_fat_percentage).toBeNull();
    expect(result.steps).toBeNull();
  });
});
