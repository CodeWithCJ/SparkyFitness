import { beforeEach, describe, expect, it, vi } from 'vitest';
import { todayInZone } from '@workspace/shared';
import {
  resolveHandler,
  customMeasurementHandler,
  HEALTH_TYPE_HANDLERS,
  type HealthBatchContext,
  type HealthEntryContext,
  type PreparedHealthEntry,
} from '../services/healthDataHandlers.js';
import measurementRepository from '../models/measurementRepository.js';
import waterContainerRepository from '../models/waterContainerRepository.js';
import * as genericHealthRepository from '../models/genericHealthRepository.js';
import * as mindfulnessRepository from '../models/mindfulnessRepository.js';
import type { WaterContainerResponse } from '@workspace/shared';

vi.mock('../models/measurementRepository.js', () => ({
  default: {
    upsertWaterIntakeSamples: vi.fn(),
    bulkUpsertCustomMeasurements: vi.fn(),
    bulkUpsertCheckInMeasurements: vi.fn(),
    getCheckInMeasurementsByDateRange: vi.fn(),
  },
}));
vi.mock('../models/waterContainerRepository.js', () => ({
  default: {
    getPrimaryWaterContainerByUserId: vi.fn(),
  },
}));
vi.mock('../models/genericHealthRepository.js', () => ({
  upsertDailyHealthMetrics: vi.fn(),
}));
vi.mock('../models/mindfulnessRepository.js', () => ({
  createMindfulnessSession: vi.fn(),
}));

// Guards the registry against alias drift: every case label from the old
// processHealthData switch must resolve to the same handler it did before the
// extraction, and unknown types must fall through to the custom-measurement
// default.
describe('health data handler registry', () => {
  it.each([
    ['step', 'steps'],
    ['steps', 'steps'],
    ['water', 'water'],
    ['Active Calories', 'active_calories'],
    ['active_calories', 'active_calories'],
    ['ActiveCaloriesBurned', 'active_calories'],
    ['total_calories', 'total_calories'],
    ['TotalCaloriesBurned', 'total_calories'],
    ['weight', 'weight'],
    ['body_fat_percentage', 'body_fat'],
    ['body_fat', 'body_fat'],
    ['height', 'height'],
    ['Height', 'height'],
    ['neck', 'neck'],
    ['waist', 'waist'],
    ['hips', 'hips'],
    ['SleepSession', 'SleepSession'],
    ['Stress', 'Stress'],
    ['ExerciseSession', 'Workout'],
    ['Workout', 'Workout'],
    ['Nutrition', 'Nutrition'],
    ['sleep_entry', 'sleep_entry'],
    // Smart-scale composition: these previously had no handler and fell
    // through to custom_measurements. Garmin emits the column names directly;
    // Health Connect uses bone_mass/BoneMass.
    ['muscle_mass_kg', 'muscle_mass_kg'],
    ['muscle_mass', 'muscle_mass_kg'],
    ['bone_mass_kg', 'bone_mass_kg'],
    ['bone_mass', 'bone_mass_kg'],
    ['BoneMass', 'bone_mass_kg'],
    ['body_water_percentage', 'body_water_percentage'],
    // Health Connect body water is a mass, converted to a percentage.
    ['body_water_mass', 'body_water_mass'],
    ['BodyWaterMass', 'body_water_mass'],
    ['bmr', 'bmr'],
    ['basal_metabolic_rate', 'bmr'],
    ['BasalMetabolicRate', 'bmr'],
    ['resting_energy', 'bmr'],
    ['MindfulnessSession', 'MindfulnessSession'],
    ['MindfulSession', 'MindfulnessSession'],
    ['mindfulness_session', 'MindfulnessSession'],
    ['mindfulness', 'MindfulnessSession'],
    ['mindful', 'MindfulnessSession'],
    // Daily wearable summary readings: also copied to daily_health_metrics.
    ['resting_heart_rate', 'resting_heart_rate'],
    ['RestingHeartRate', 'resting_heart_rate'],
    ['vo2_max', 'vo2_max'],
    ['Vo2Max', 'vo2_max'],
  ])("resolves '%s' to the '%s' handler", (rawType, canonicalKey) => {
    expect(resolveHandler(rawType)).toBe(HEALTH_TYPE_HANDLERS[canonicalKey]);
  });

  it('leaves lean body mass as a custom measurement (it is not muscle mass)', () => {
    expect(resolveHandler('lean_body_mass')).toBeUndefined();
    expect(resolveHandler('LeanBodyMass')).toBeUndefined();
  });

  it('returns undefined for unknown types so callers fall back to the custom-measurement handler', () => {
    expect(resolveHandler('heart_rate')).toBeUndefined();
    expect(resolveHandler('running_speed_avg')).toBeUndefined();
    expect(resolveHandler('Weight')).toBeUndefined(); // only lowercase 'weight' had a dedicated case
    expect(resolveHandler(undefined)).toBeUndefined();
    expect(customMeasurementHandler).toBeDefined();
  });
});

describe('totalCaloriesHandler', () => {
  const totalCaloriesHandler = HEALTH_TYPE_HANDLERS['total_calories'];
  const ctx = {
    userId: 'user-1',
    actingUserId: 'actor-1',
    parsedDate: '2026-08-03',
    entryTimestamp: '2026-08-03T12:00:00.000Z',
    entryHour: 12,
  } as unknown as HealthEntryContext;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      genericHealthRepository.upsertDailyHealthMetrics
    ).mockResolvedValue({
      id: 'daily-1',
      user_id: 'user-1',
      entry_date: '2026-08-03',
      source_provider: 'health_connect',
      total_calories: 1234,
    } as never);
  });

  it('persists Health Connect total burn as a daily wearable summary', async () => {
    const outcome = await totalCaloriesHandler.handle(
      { value: 1234, source: 'Health Connect' },
      ctx
    );

    expect(
      genericHealthRepository.upsertDailyHealthMetrics
    ).toHaveBeenCalledWith('user-1', 'actor-1', {
      user_id: 'user-1',
      entry_date: '2026-08-03',
      source_provider: 'health_connect',
      total_calories: 1234,
      total_calories_captured_at: new Date('2026-08-03T12:00:00.000Z'),
    });
    expect(outcome.status).toBe('success');
  });

  it('normalizes the legacy HealthConnect source spelling', async () => {
    await totalCaloriesHandler.handle(
      { value: 1234, source: 'HealthConnect' },
      ctx
    );

    expect(
      genericHealthRepository.upsertDailyHealthMetrics
    ).toHaveBeenCalledWith(
      'user-1',
      'actor-1',
      expect.objectContaining({ source_provider: 'health_connect' })
    );
  });

  it('rejects total calories above the daily ingestion limit', async () => {
    const result = await totalCaloriesHandler.handle(
      { value: 20_001, source: 'Health Connect' },
      ctx
    );

    expect(result).toMatchObject({ status: 'error' });
    expect(
      genericHealthRepository.upsertDailyHealthMetrics
    ).not.toHaveBeenCalled();
  });

  it.each(['', '1234kcal', -1, Number.NaN])(
    'rejects invalid total burn %s',
    async (value) => {
      const outcome = await totalCaloriesHandler.handle(
        { value, source: 'Health Connect' },
        ctx
      );

      expect(outcome.status).toBe('error');
    }
  );
});

describe('waterHandler.handleBatch', () => {
  const waterHandler = HEALTH_TYPE_HANDLERS['water'];
  const ctx = {
    userId: 'user-1',
    actingUserId: 'actor-1',
  } as unknown as HealthBatchContext;

  const prepared = (
    entry: Record<string, unknown>,
    parsedDate = '2026-08-03'
  ): PreparedHealthEntry => ({
    entry,
    parsedDate,
    entryTimestamp: `${parsedDate}T12:00:00.000Z`,
    entryHour: 12,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      waterContainerRepository.getPrimaryWaterContainerByUserId
    ).mockResolvedValue({
      id: 7,
      name: 'Big Bottle',
    } as unknown as WaterContainerResponse);
    vi.mocked(
      measurementRepository.upsertWaterIntakeSamples
    ).mockImplementation(
      async (_userId: string, _actingUserId: string, samples: unknown[]) =>
        samples.map(() => ({ id: 'row' }))
    );
  });

  it('maps outcomes back to their original indexes across interleaved sources', async () => {
    const outcomes = await waterHandler.handleBatch!(
      [
        prepared({ value: 250, source: 'healthkit', source_id: 'hk-1' }),
        prepared({ value: 500, source: 'health_connect', source_id: 'hc-1' }),
        prepared({ value: 'not-a-number', source: 'healthkit' }),
        prepared({ value: 300, source: 'healthkit', source_id: 'hk-2' }),
      ],
      ctx
    );

    expect(outcomes).toHaveLength(4);
    expect(outcomes[0].status).toBe('success');
    expect(outcomes[1].status).toBe('success');
    expect(outcomes[2].status).toBe('error');
    expect(outcomes[3].status).toBe('success');
    // One repository call per source; the invalid entry never reaches it.
    expect(
      measurementRepository.upsertWaterIntakeSamples
    ).toHaveBeenCalledTimes(2);
  });

  it('passes source_id, timestamp, and the primary container through to the repository', async () => {
    await waterHandler.handleBatch!(
      [
        prepared({
          value: 250,
          source: 'healthkit',
          source_id: 'hk-1',
          timestamp: '2026-08-03T09:30:00.000Z',
        }),
      ],
      ctx
    );

    expect(measurementRepository.upsertWaterIntakeSamples).toHaveBeenCalledWith(
      'user-1',
      'actor-1',
      [
        {
          entryDate: '2026-08-03',
          waterMl: 250,
          containerId: 7,
          containerName: 'Big Bottle',
          source: 'healthkit',
          sourceId: 'hk-1',
          loggedAt: '2026-08-03T09:30:00.000Z',
        },
      ]
    );
  });

  it('errors every entry of a source group when its repository write fails, leaving other groups intact', async () => {
    vi.mocked(
      measurementRepository.upsertWaterIntakeSamples
    ).mockImplementation(
      async (_userId: string, _actingUserId: string, samples: unknown[]) => {
        const first = samples[0] as { source: string };
        if (first.source === 'healthkit') throw new Error('boom');
        return samples.map(() => ({ id: 'row' }));
      }
    );

    const outcomes = await waterHandler.handleBatch!(
      [
        prepared({ value: 250, source: 'healthkit', source_id: 'hk-1' }),
        prepared({ value: 500, source: 'health_connect', source_id: 'hc-1' }),
        prepared({ value: 300, source: 'healthkit', source_id: 'hk-2' }),
      ],
      ctx
    );

    expect(outcomes[0]).toEqual({ status: 'error', error: 'boom' });
    expect(outcomes[1].status).toBe('success');
    expect(outcomes[2]).toEqual({ status: 'error', error: 'boom' });
  });

  it('falls back to the Default container name when the user has no primary container', async () => {
    vi.mocked(
      waterContainerRepository.getPrimaryWaterContainerByUserId
    ).mockResolvedValue(null);

    await waterHandler.handleBatch!(
      [prepared({ value: 250, source: 'healthkit', source_id: 'hk-1' })],
      ctx
    );

    const call = vi.mocked(measurementRepository.upsertWaterIntakeSamples).mock
      .calls[0];
    expect(call[2][0]).toMatchObject({
      containerId: null,
      containerName: 'Default',
    });
  });

  it('skips 0 and negative water entries without inserting intake samples', async () => {
    const outcomes = await waterHandler.handleBatch!(
      [
        prepared({ value: 0, source: 'garmin' }),
        prepared({ value: -50, source: 'garmin' }),
      ],
      ctx
    );

    expect(outcomes).toEqual([
      { status: 'success', data: null },
      { status: 'success', data: null },
    ]);
    expect(
      measurementRepository.upsertWaterIntakeSamples
    ).not.toHaveBeenCalled();
  });

  it('accepts decimal water amounts from unit conversions', async () => {
    const outcomes = await waterHandler.handleBatch!(
      [prepared({ value: 709.764, source: 'garmin', source_id: 'garmin-1' })],
      ctx
    );

    expect(outcomes[0].status).toBe('success');
    expect(measurementRepository.upsertWaterIntakeSamples).toHaveBeenCalledWith(
      'user-1',
      'actor-1',
      [
        expect.objectContaining({
          waterMl: 709.764,
          source: 'garmin',
        }),
      ]
    );
  });

  it('rejects blank and whitespace-only water values with an error', async () => {
    const singleOutcome = await waterHandler.handle(
      { value: '   ', type: 'water' },
      {
        userId: 'user-1',
        actingUserId: 'actor-1',
        parsedDate: '2026-08-03',
      } as unknown as HealthEntryContext
    );
    expect(singleOutcome).toEqual({
      status: 'error',
      error: 'Invalid value for water. Must be a valid number.',
    });

    const batchOutcomes = await waterHandler.handleBatch!(
      [
        prepared({ value: '', source: 'garmin' }),
        prepared({ value: '   ', source: 'garmin' }),
      ],
      ctx
    );
    expect(batchOutcomes).toEqual([
      {
        status: 'error',
        error: 'Invalid value for water. Must be a valid number.',
      },
      {
        status: 'error',
        error: 'Invalid value for water. Must be a valid number.',
      },
    ]);
  });
});

describe('bmrHandler.handleBatch', () => {
  const bmrHandler = HEALTH_TYPE_HANDLERS['bmr'];
  const ctx = {
    userId: 'user-1',
    actingUserId: 'actor-1',
  } as unknown as HealthBatchContext;

  const prepared = (
    entry: Record<string, unknown>,
    parsedDate = '2026-08-03'
  ): PreparedHealthEntry => ({
    entry,
    parsedDate,
    entryTimestamp: `${parsedDate}T12:00:00.000Z`,
    entryHour: 12,
  });

  beforeEach(() => {
    vi.mocked(
      measurementRepository.bulkUpsertCheckInMeasurements
    ).mockResolvedValue([{ id: 'row-1' } as never]);
  });

  it('accepts valid numeric values within 300 to 10000 kcal', async () => {
    const outcomes = await bmrHandler.handleBatch!(
      [prepared({ type: 'bmr', value: '1650' })],
      ctx
    );

    expect(outcomes[0].status).toBe('success');
  });

  it('refuses an in-progress day only for sources that accumulate', async () => {
    // Garmin's bmrKilocalories is a running daily total, so a value read before
    // the day ends is only part of it. HealthKit stamps each fully-elapsed day
    // with D+1 and Health Connect sends an instantaneous rate, so both are valid
    // on the current date — refusing today wholesale stopped iOS storing any BMR.
    const today = todayInZone('UTC');
    const outcomes = await bmrHandler.handleBatch!(
      [
        prepared({ type: 'bmr', value: '1650', source: 'garmin' }, today),
        prepared(
          { type: 'bmr', value: '1650', source: 'garmin' },
          '2026-08-03'
        ),
        prepared({ type: 'bmr', value: '1650', source: 'HealthKit' }, today),
      ],
      ctx
    );

    expect(outcomes[0].status).toBe('skipped');
    expect(outcomes[1].status).toBe('success');
    expect(outcomes[2].status).toBe('success');
  });

  it('rejects values with non-numeric suffixes or out of bounds', async () => {
    const outcomes = await bmrHandler.handleBatch!(
      [
        prepared({ type: 'bmr', value: '1650kcal' }),
        prepared({ type: 'bmr', value: '300xyz' }),
        prepared({ type: 'bmr', value: '599' }),
        prepared({ type: 'bmr', value: '6001' }),
        prepared({ type: 'bmr', value: '' }),
        // The reading from issue #2395: physiologically impossible for an adult,
        // but inside the old 300-10000 range that shipped in v1.6.5.
        prepared({ type: 'bmr', value: '350' }),
      ],
      ctx
    );

    expect(outcomes[0].status).toBe('error');
    expect(outcomes[1].status).toBe('error');
    expect(outcomes[2].status).toBe('error');
    expect(outcomes[3].status).toBe('error');
    expect(outcomes[4].status).toBe('error');
    expect(outcomes[5].status).toBe('error');
  });

  it('accepts the 600 and 6000 boundary values', async () => {
    const outcomes = await bmrHandler.handleBatch!(
      [
        prepared({ type: 'bmr', value: '600' }),
        prepared({ type: 'bmr', value: '6000' }),
      ],
      ctx
    );

    expect(outcomes[0].status).not.toBe('error');
    expect(outcomes[1].status).not.toBe('error');
  });
});

describe('bodyWaterMassHandler.handleBatch', () => {
  const bodyWaterMassHandler = HEALTH_TYPE_HANDLERS['body_water_mass'];
  const ctx = {
    userId: 'user-1',
    actingUserId: 'actor-1',
  } as unknown as HealthBatchContext;

  const prepared = (
    entry: Record<string, unknown>,
    parsedDate = '2026-08-03'
  ): PreparedHealthEntry => ({
    entry,
    parsedDate,
    entryTimestamp: `${parsedDate}T12:00:00.000Z`,
    entryHour: 12,
  });

  const writtenRows = () =>
    vi.mocked(measurementRepository.bulkUpsertCheckInMeasurements).mock
      .calls[0][2];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      measurementRepository.bulkUpsertCheckInMeasurements
    ).mockResolvedValue([{ id: 'row-1' }, { id: 'row-2' }] as never);
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([] as never);
  });

  it('converts kg to a percentage using a weight from the same batch', async () => {
    const outcomes = await bodyWaterMassHandler.handleBatch!(
      [
        prepared({ type: 'BodyWaterMass', value: 45 }),
        prepared({ type: 'weight', value: 80 }),
      ],
      ctx
    );

    expect(outcomes.map((o) => o.status)).toEqual(['success', 'success']);
    expect(writtenRows()).toEqual([
      {
        entryDate: '2026-08-03',
        measurements: { body_water_percentage: 56.25 },
      },
      { entryDate: '2026-08-03', measurements: { weight: 80 } },
    ]);
    expect(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).not.toHaveBeenCalled();
  });

  it('falls back to the stored weight of the same day', async () => {
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([
      { entry_date: '2026-08-04', weight: '79.00' },
      { entry_date: '2026-08-03', weight: '80.00' },
    ] as never);

    const outcomes = await bodyWaterMassHandler.handleBatch!(
      [prepared({ type: 'BodyWaterMass', value: 44 })],
      ctx
    );

    expect(outcomes[0].status).toBe('success');
    expect(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).toHaveBeenCalledWith('user-1', '2026-08-03', '2026-08-03');
    expect(writtenRows()).toEqual([
      { entryDate: '2026-08-03', measurements: { body_water_percentage: 55 } },
    ]);
  });

  it('skips the record when there is no weight on that day', async () => {
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([{ entry_date: '2026-08-03', weight: null }] as never);

    const outcomes = await bodyWaterMassHandler.handleBatch!(
      [
        prepared({ type: 'BodyWaterMass', value: 44 }),
        // A weight on another day must not be used.
        prepared({ type: 'weight', value: 80 }, '2026-08-02'),
      ],
      ctx
    );

    expect(outcomes[0].status).toBe('skipped');
    expect(outcomes[1].status).toBe('success');
    expect(writtenRows()).toEqual([
      { entryDate: '2026-08-02', measurements: { weight: 80 } },
    ]);
  });

  it('rejects non-positive values and masses above the weight', async () => {
    const outcomes = await bodyWaterMassHandler.handleBatch!(
      [
        prepared({ type: 'BodyWaterMass', value: 0 }),
        prepared({ type: 'BodyWaterMass', value: 'abc' }),
        prepared({ type: 'BodyWaterMass', value: 90 }),
        prepared({ type: 'weight', value: 80 }),
      ],
      ctx
    );

    expect(outcomes.map((o) => o.status)).toEqual([
      'error',
      'error',
      'error',
      'success',
    ]);
  });

  it('reports an error instead of skipping when the weight lookup fails', async () => {
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockRejectedValue(new Error('connection lost'));

    const outcomes = await bodyWaterMassHandler.handleBatch!(
      [prepared({ type: 'BodyWaterMass', value: 44 })],
      ctx
    );

    expect(outcomes[0]).toEqual({
      status: 'error',
      error: 'Failed to process entry: connection lost',
    });
  });
});

describe('mindfulnessHandler', () => {
  const handler = HEALTH_TYPE_HANDLERS.MindfulnessSession;
  const ctx = {
    userId: 'user-123',
    actingUserId: 'acting-456',
    parsedDate: '2026-10-05',
    entryTimestamp: '2026-10-05T10:00:00.000Z',
    entryHour: 10,
    resolveCategory: vi.fn(),
  } as unknown as HealthEntryContext;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully creates a mindfulness session with valid duration and telemetry', async () => {
    vi.mocked(mindfulnessRepository.createMindfulnessSession).mockResolvedValue(
      {
        id: 'session-1',
        user_id: 'user-123',
        entry_date: '2026-10-05',
        start_time: '2026-10-05T10:00:00.000Z',
        end_time: '2026-10-05T10:15:00.000Z',
        duration_seconds: 900,
        session_type: 'meditation',
        provider: 'apple_health',
        external_id: 'ext-abc',
        heart_rate_avg: 68,
        heart_rate_start: 78,
        heart_rate_end: 62,
        hrv_rmssd: 55,
        stress_level_start: null,
        stress_level_end: null,
        mood_entry_id: null,
        notes: 'Morning breathwork',
        created_at: '2026-10-05T10:15:00.000Z',
        updated_at: '2026-10-05T10:15:00.000Z',
      }
    );

    const result = await handler.handle(
      {
        type: 'MindfulnessSession',
        duration_seconds: 900,
        startTime: '2026-10-05T10:00:00.000Z',
        endTime: '2026-10-05T10:15:00.000Z',
        source: 'apple_health',
        source_id: 'ext-abc',
        session_type: 'meditation',
        heart_rate_avg: 68,
        heart_rate_start: 78,
        heart_rate_end: 62,
        hrv_rmssd: 55,
        notes: 'Morning breathwork',
      },
      ctx
    );

    expect(result.status).toBe('success');
    expect(mindfulnessRepository.createMindfulnessSession).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({
        duration_seconds: 900,
        session_type: 'meditation',
        provider: 'apple_health',
        external_id: 'ext-abc',
        heart_rate_avg: 68,
        heart_rate_start: 78,
        heart_rate_end: 62,
        hrv_rmssd: 55,
      }),
      'acting-456'
    );
  });

  it('rejects entries with non-positive duration', async () => {
    const result = await handler.handle(
      {
        type: 'MindfulnessSession',
        duration_seconds: 0,
      },
      ctx
    );

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toContain('Invalid duration');
    }
  });
});

describe('daily summary readings (resting heart rate, VO2 max)', () => {
  const restingHeartRateHandler = HEALTH_TYPE_HANDLERS['resting_heart_rate'];
  const vo2MaxHandler = HEALTH_TYPE_HANDLERS['vo2_max'];
  const ctx = {
    userId: 'user-1',
    actingUserId: 'actor-1',
    resolveCategory: vi.fn(),
  } as unknown as HealthBatchContext;

  const prepared = (
    entry: Record<string, unknown>,
    entryTimestamp = '2026-10-08T07:00:00.000Z',
    parsedDate = '2026-10-08'
  ): PreparedHealthEntry => ({
    entry,
    parsedDate,
    entryTimestamp,
    entryHour: new Date(entryTimestamp).getUTCHours(),
  });

  const dailyUpserts = () =>
    vi
      .mocked(genericHealthRepository.upsertDailyHealthMetrics)
      .mock.calls.map((call) => call[2]);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ctx.resolveCategory).mockResolvedValue({
      id: 'cat-1',
      data_type: 'numeric',
      frequency: 'Daily',
    });
    vi.mocked(
      measurementRepository.bulkUpsertCustomMeasurements
    ).mockImplementation(
      async (_userId: string, _actingUserId: string, rows: unknown[]) =>
        rows.map((_, i) => ({ id: `row-${i}` }))
    );
    vi.mocked(
      genericHealthRepository.upsertDailyHealthMetrics
    ).mockResolvedValue({ id: 'daily-1' } as never);
  });

  it('stores a resting heart rate as a custom measurement and in the daily summary', async () => {
    const outcomes = await restingHeartRateHandler.handleBatch!(
      [
        prepared({
          type: 'resting_heart_rate',
          value: 58,
          source: 'Health Connect',
        }),
      ],
      ctx
    );

    expect(outcomes[0].status).toBe('success');
    expect(
      measurementRepository.bulkUpsertCustomMeasurements
    ).toHaveBeenCalledWith('user-1', 'actor-1', [
      expect.objectContaining({ categoryId: 'cat-1', value: 58 }),
    ]);
    expect(dailyUpserts()).toEqual([
      {
        user_id: 'user-1',
        entry_date: '2026-10-08',
        source_provider: 'health_connect',
        resting_heart_rate: 58,
      },
    ]);
  });

  it('keeps the reading taken last on a day, whatever order it arrives in', async () => {
    await restingHeartRateHandler.handleBatch!(
      [
        prepared(
          { type: 'RestingHeartRate', value: 55, source: 'Health Connect' },
          '2026-10-08T21:00:00.000Z'
        ),
        prepared(
          { type: 'RestingHeartRate', value: 61, source: 'Health Connect' },
          '2026-10-08T06:00:00.000Z'
        ),
      ],
      ctx
    );

    // Both readings stay in custom_measurements.
    expect(
      vi.mocked(measurementRepository.bulkUpsertCustomMeasurements).mock
        .calls[0][2]
    ).toHaveLength(2);
    expect(dailyUpserts()).toEqual([
      expect.objectContaining({ resting_heart_rate: 55 }),
    ]);
  });

  it('writes the Health Connect row when the record has no source', async () => {
    await restingHeartRateHandler.handleBatch!(
      [prepared({ type: 'resting_heart_rate', value: 60, source: '' })],
      ctx
    );

    expect(dailyUpserts()).toEqual([
      expect.objectContaining({ source_provider: 'health_connect' }),
    ]);
  });

  it('keeps one daily row per source', async () => {
    await restingHeartRateHandler.handleBatch!(
      [
        prepared({
          type: 'resting_heart_rate',
          value: 57,
          source: 'Apple Health',
        }),
        prepared({
          type: 'resting_heart_rate',
          value: 59,
          source: 'Health Connect',
        }),
      ],
      ctx
    );

    expect(dailyUpserts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_provider: 'apple_health',
          resting_heart_rate: 57,
        }),
        expect.objectContaining({
          source_provider: 'health_connect',
          resting_heart_rate: 59,
        }),
      ])
    );
    expect(dailyUpserts()).toHaveLength(2);
  });

  it('keeps an implausible value out of the daily summary but stores it as before', async () => {
    const outcomes = await restingHeartRateHandler.handleBatch!(
      [
        prepared({ type: 'resting_heart_rate', value: 19 }),
        prepared({ type: 'resting_heart_rate', value: 251 }),
      ],
      ctx
    );

    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      'success',
      'success',
    ]);
    expect(
      vi.mocked(measurementRepository.bulkUpsertCustomMeasurements).mock
        .calls[0][2]
    ).toHaveLength(2);
    expect(
      genericHealthRepository.upsertDailyHealthMetrics
    ).not.toHaveBeenCalled();
  });

  it('does not touch the daily summary when the custom measurement is rejected', async () => {
    const outcomes = await restingHeartRateHandler.handleBatch!(
      [prepared({ type: 'resting_heart_rate', value: 'n/a' })],
      ctx
    );

    expect(outcomes[0].status).toBe('error');
    expect(
      genericHealthRepository.upsertDailyHealthMetrics
    ).not.toHaveBeenCalled();
  });

  it('reports a failed daily summary write on the records it came from', async () => {
    vi.mocked(
      genericHealthRepository.upsertDailyHealthMetrics
    ).mockRejectedValueOnce(new Error('db down'));

    const outcomes = await restingHeartRateHandler.handleBatch!(
      [prepared({ type: 'resting_heart_rate', value: 58 })],
      ctx
    );

    expect(outcomes[0]).toEqual({
      status: 'error',
      error: 'Failed to update daily health metrics: db down',
    });
  });

  it('rounds to the precision of the daily summary columns', async () => {
    await restingHeartRateHandler.handleBatch!(
      [prepared({ type: 'resting_heart_rate', value: '57.6' })],
      ctx
    );
    await vo2MaxHandler.handleBatch!(
      [prepared({ type: 'Vo2Max', value: 43.27, source: 'Health Connect' })],
      ctx
    );

    expect(dailyUpserts()).toEqual([
      expect.objectContaining({ resting_heart_rate: 58 }),
      {
        user_id: 'user-1',
        entry_date: '2026-10-08',
        source_provider: 'health_connect',
        vo2_max: 43.3,
      },
    ]);
  });
});
