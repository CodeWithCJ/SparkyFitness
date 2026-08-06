import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveHandler,
  customMeasurementHandler,
  HEALTH_TYPE_HANDLERS,
  type HealthBatchContext,
  type PreparedHealthEntry,
} from '../services/healthDataHandlers.js';
import measurementRepository from '../models/measurementRepository.js';
import waterContainerRepository from '../models/waterContainerRepository.js';

vi.mock('../models/measurementRepository.js', () => ({
  default: {
    upsertWaterIntakeSamples: vi.fn(),
  },
}));
vi.mock('../models/waterContainerRepository.js', () => ({
  default: {
    getPrimaryWaterContainerByUserId: vi.fn(),
  },
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
    ).mockResolvedValue({ id: 7, name: 'Big Bottle' });
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
});
