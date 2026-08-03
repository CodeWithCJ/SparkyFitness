import { describe, it, expect } from 'vitest';
import {
  exerciseEntriesSchema,
  checkInMeasurementsSchema,
  exerciseEntryLapsSchema,
  exerciseEntryGpsPointsSchema,
  healthMetricSamplesSchema,
  vitalsEntriesSchema,
  dailyHealthMetricsSchema,
  ExerciseEntries,
  ExerciseEntryLaps,
  ExerciseEntryGpsPoints,
  VitalsEntries,
  DailyHealthMetrics,
} from '@workspace/shared';

describe('Generic Health & Workout Zod Schemas', () => {
  it('should validate enhanced exerciseEntriesSchema with running dynamics and FIT telemetry', () => {
    const validEntry = {
      id: '11111111-1111-1111-1111-111111111111' as ExerciseEntries['id'],
      user_id: '22222222-2222-2222-2222-222222222222',
      // NOT NULL in the database; the schema used to allow null and disagreed.
      exercise_id: '33333333-3333-3333-3333-333333333333',
      duration_minutes: 45,
      calories_burned: 450,
      entry_date: new Date('2026-07-29'),
      entry_time: '08:00:00',
      notes: 'Morning interval run',
      created_at: new Date(),
      updated_at: new Date(),
      workout_plan_assignment_id: null,
      image_url: null,
      created_by_user_id: null,
      exercise_name: 'Outdoor Run',
      calories_per_hour: 600,
      updated_by_user_id: null,
      category: 'running',
      source: 'garmin',
      source_id: 'GARMIN-12345',
      force: null,
      level: null,
      mechanic: null,
      equipment: null,
      primary_muscles: null,
      secondary_muscles: null,
      instructions: null,
      images: null,
      distance: 8500,
      avg_heart_rate: 155,
      exercise_preset_entry_id: null,
      sort_order: 1,
      superset_group: null,
      modality: 'endurance',
      max_heart_rate: 178,
      heart_rate_recovery_1min: 32,
      avg_respiration_brpm: 24.5,
      max_respiration_brpm: 34.0,
      avg_speed_mps: 3.14,
      max_speed_mps: 4.25,
      avg_cadence: 172,
      max_cadence: 184,
      avg_power_watts: 245.5,
      max_power_watts: 310.0,
      normalized_power_watts: 252.0,
      tss_score: 55.4,
      intensity_factor: 0.88,
      ground_contact_time_ms: 220.5,
      vertical_oscillation_mm: 8.4,
      stride_length_cm: 115.2,
      avg_temperature_celsius: 22.5,
      max_temperature_celsius: 24.0,
      elevation_gain_meters: 120.0,
      elevation_loss_meters: 118.0,
      floors_climbed: 12,
      stroke_count: null,
      training_load: 85.0,
      aerobic_training_effect: 3.5,
      anaerobic_training_effect: 1.2,
      vo2_max_estimate: 54.2,
      moving_time_seconds: 2650,
      elapsed_time_seconds: 2700,
      work_time_seconds: null,
      resting_calories: 25,
      active_calories: 425,
      avg_moving_speed_mps: 3.2,
      min_elevation_meters: 10.0,
      max_elevation_meters: 130.0,
      weather_temp_celsius: 18.5,
      weather_condition: 'Partly Cloudy',
      weather_wind_speed_mps: 3.1,
      weather_humidity_percentage: 62.0,
      gear_name: 'Trail Runners',
      gear_external_id: 'GEAR-998',
    };

    const parsed = exerciseEntriesSchema.parse(validEntry);
    expect(parsed.max_heart_rate).toBe(178);
    expect(parsed.ground_contact_time_ms).toBe(220.5);
    expect(parsed.avg_respiration_brpm).toBe(24.5);
  });

  it('should validate checkInMeasurementsSchema with smart scale metrics', () => {
    const validCheckIn = {
      id: '33333333-3333-3333-3333-333333333333',
      user_id: '22222222-2222-2222-2222-222222222222',
      entry_date: new Date('2026-07-29'),
      weight: 75.5,
      neck: 38.0,
      waist: 81.5,
      hips: 95.0,
      steps: 10450,
      created_at: new Date(),
      updated_at: new Date(),
      height: 178.0,
      body_fat_percentage: 16.5,
      created_by_user_id: null,
      updated_by_user_id: null,
      muscle_mass_kg: 34.2,
      bone_mass_kg: 3.1,
      body_water_percentage: 61.4,
    };

    const parsed = checkInMeasurementsSchema.parse(validCheckIn);
    expect(parsed.weight).toBe(75.5);
    expect(parsed.muscle_mass_kg).toBe(34.2);
    expect(parsed.bone_mass_kg).toBe(3.1);
    expect(parsed.body_water_percentage).toBe(61.4);
  });

  it('should validate exerciseEntryLapsSchema', () => {
    const validLap = {
      id: '44444444-4444-4444-4444-444444444444' as ExerciseEntryLaps['id'],
      user_id: '22222222-2222-2222-2222-222222222222',
      exercise_entry_id: '11111111-1111-1111-1111-111111111111',
      entry_date: '2026-07-29',
      lap_index: 1,
      start_time: new Date('2026-07-29T08:00:00Z'),
      end_time: new Date('2026-07-29T08:05:00Z'),
      duration_seconds: 300,
      distance_meters: 1000.0,
      calories: 55.0,
      avg_heart_rate: 150,
      max_heart_rate: 162,
      avg_respiration_brpm: 22.0,
      max_respiration_brpm: 28.0,
      avg_speed_mps: 3.33,
      max_speed_mps: 3.85,
      avg_cadence: 170,
      avg_power_watts: 240.0,
      elevation_gain_meters: 10.0,
      elevation_loss_meters: 5.0,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const parsed = exerciseEntryLapsSchema.parse(validLap);
    expect(parsed.lap_index).toBe(1);
    expect(parsed.entry_date).toBe('2026-07-29');
    expect(parsed.user_id).toBe('22222222-2222-2222-2222-222222222222');
    expect(parsed.avg_respiration_brpm).toBe(22.0);
  });

  it('should validate exerciseEntryGpsPointsSchema (one row per workout, points array)', () => {
    const validRow = {
      id: '55555555-5555-5555-5555-555555555555' as ExerciseEntryGpsPoints['id'],
      user_id: '22222222-2222-2222-2222-222222222222',
      exercise_entry_id: '11111111-1111-1111-1111-111111111111',
      entry_date: '2026-07-29',
      points: [
        {
          t: '2026-07-29T08:01:00.000Z',
          lat: 37.774929,
          lon: -122.419418,
          alt: 15.2,
          speed: 3.2,
          hr: 152,
          resp: 23.5,
          cad: 174,
          power: 245.0,
          gct: 218.0,
          vo: 8.2,
          stride: 114.0,
          temp: 21.5,
          dist: 200.0,
          hacc: 2.5,
          vacc: 3.0,
          course: 180.0,
        },
      ],
      created_at: new Date(),
      updated_at: new Date(),
    };

    const parsed = exerciseEntryGpsPointsSchema.parse(validRow);
    expect(parsed.entry_date).toBe('2026-07-29');
    expect(parsed.user_id).toBe('22222222-2222-2222-2222-222222222222');
    expect(parsed.points).toHaveLength(1);
    expect(parsed.points[0].lat).toBe(37.774929);
    expect(parsed.points[0].resp).toBe(23.5);
  });

  it('should validate healthMetricSamplesSchema for heart_rate, respiration, spo2, and vitalsEntriesSchema', () => {
    const validHR = {
      id: '66666666-6666-6666-6666-666666666666',
      user_id: '22222222-2222-2222-2222-222222222222',
      metric: 'heart_rate' as const,
      entry_date: '2026-07-29',
      source_provider: 'apple_health',
      device_name: 'Apple Watch Series 9',
      samples: [
        {
          t: '2026-07-29T10:30:00.000Z',
          bpm: 68,
          context: 'sleeping',
          sl: '99999999-9999-9999-9999-999999999999',
        },
      ],
      created_at: new Date(),
      updated_at: new Date(),
    };

    const parsedHR = healthMetricSamplesSchema.parse(validHR);
    expect(parsedHR.metric).toBe('heart_rate');
    if (parsedHR.metric === 'heart_rate') {
      expect(parsedHR.samples[0].bpm).toBe(68);
      expect(parsedHR.samples[0].sl).toBe(
        '99999999-9999-9999-9999-999999999999'
      );
    }

    const validResp = {
      id: '66666666-6666-6666-6666-666666666667',
      user_id: '22222222-2222-2222-2222-222222222222',
      metric: 'respiration' as const,
      entry_date: '2026-07-29',
      source_provider: 'apple_health',
      device_name: null,
      samples: [
        { t: '2026-07-29T10:30:00.000Z', brpm: 16.5, context: 'sleeping' },
      ],
      created_at: new Date(),
      updated_at: new Date(),
    };
    const parsedResp = healthMetricSamplesSchema.parse(validResp);
    expect(parsedResp.metric).toBe('respiration');
    if (parsedResp.metric === 'respiration') {
      expect(parsedResp.samples[0].brpm).toBe(16.5);
    }

    const validSpo2 = {
      id: '66666666-6666-6666-6666-666666666668',
      user_id: '22222222-2222-2222-2222-222222222222',
      metric: 'spo2' as const,
      entry_date: '2026-07-29',
      source_provider: 'garmin',
      device_name: null,
      samples: [{ t: '2026-07-29T10:30:00.000Z', percentage: 98.5 }],
      created_at: new Date(),
      updated_at: new Date(),
    };
    const parsedSpo2 = healthMetricSamplesSchema.parse(validSpo2);
    expect(parsedSpo2.metric).toBe('spo2');
    if (parsedSpo2.metric === 'spo2') {
      expect(parsedSpo2.samples[0].percentage).toBe(98.5);
    }

    const validVitals = {
      id: '66666666-6666-6666-6666-666666666669' as VitalsEntries['id'],
      user_id: '22222222-2222-2222-2222-222222222222',
      entry_date: '2026-07-29',
      timestamp: new Date('2026-07-29T10:30:00Z'),
      systolic_mmhg: 120,
      diastolic_mmhg: 80,
      blood_glucose_mgdl: 95.0,
      body_temperature_celsius: 36.6,
      meal_context: 'fasting',
      source_provider: 'withings',
      device_name: null,
      external_id: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const parsedVitals = vitalsEntriesSchema.parse(validVitals);
    expect(parsedVitals.systolic_mmhg).toBe(120);
  });

  it('should validate healthMetricSamplesSchema for hrv with optional sl (sleep) linkage', () => {
    const validHRV = {
      id: '77777777-7777-7777-7777-777777777777',
      user_id: '22222222-2222-2222-2222-222222222222',
      metric: 'hrv' as const,
      entry_date: '2026-07-29',
      source_provider: 'apple_health',
      device_name: 'Apple Watch Series 9',
      samples: [
        {
          t: '2026-07-29T05:00:00.000Z',
          rmssd_ms: 64.5,
          sdnn_ms: 72.0,
          status: 'balanced',
          sl: '99999999-9999-9999-9999-999999999999',
        },
      ],
      created_at: new Date(),
      updated_at: new Date(),
    };

    const parsed = healthMetricSamplesSchema.parse(validHRV);
    expect(parsed.metric).toBe('hrv');
    if (parsed.metric === 'hrv') {
      expect(parsed.samples[0].rmssd_ms).toBe(64.5);
      expect(parsed.samples[0].sl).toBe('99999999-9999-9999-9999-999999999999');
    }
  });

  it('should validate dailyHealthMetricsSchema', () => {
    const validDaily = {
      id: '88888888-8888-8888-8888-888888888888' as DailyHealthMetrics['id'],
      user_id: '22222222-2222-2222-2222-222222222222',
      entry_date: '2026-07-29',
      source_provider: 'garmin',
      device_name: 'Garmin Forerunner 965',
      total_steps: 12450,
      step_goal: 10000,
      total_distance_meters: 9850.0,
      floors_ascended: 14,
      floors_descended: 12,
      active_calories: 650.0,
      bmr_calories: 1750.0,
      total_calories: 2400.0,
      highly_active_seconds: 3600,
      active_seconds: 7200,
      sedentary_seconds: 28800,
      moderate_intensity_minutes: 45,
      vigorous_intensity_minutes: 30,
      exercise_minutes: 60,
      stand_hours: 12,
      resting_heart_rate: 54,
      heart_rate_recovery_1min: 28,
      vo2_max: 54.5,
      fitness_age: 28.0,
      lactate_threshold_bpm: 168,
      lactate_threshold_speed_mps: 3.85,
      walking_asymmetry_percentage: 0.5,
      hill_score: 72,
      race_prediction_5k_seconds: 1180,
      race_prediction_10k_seconds: 2480,
      race_prediction_half_marathon_seconds: 5500,
      race_prediction_marathon_seconds: 11800,
      recovery_time_hours: 21,
      training_readiness_score: 85,
      endurance_score: 780,
      weekly_training_load: 450.0,
      acute_training_load: 120.0,
      chronic_training_load: 110.0,
      acwr_ratio: 1.09,
      avg_stress_level: 24,
      max_stress_level: 68,
      body_battery_charged: 75,
      body_battery_drained: 60,
      body_battery_highest: 95,
      body_battery_lowest: 35,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const parsed = dailyHealthMetricsSchema.parse(validDaily);
    expect(parsed.total_steps).toBe(12450);
    expect(parsed.body_battery_highest).toBe(95);
    expect(parsed.acwr_ratio).toBe(1.09);
  });
});
