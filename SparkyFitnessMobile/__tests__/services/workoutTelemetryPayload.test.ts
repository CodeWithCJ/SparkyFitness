import {
  attachWorkoutTelemetry,
  stripTelemetryFromRawData,
} from '../../src/services/shared/workoutTelemetryPayload';
import type { TransformedExerciseSession } from '../../src/types/healthRecords';

const makeSession = (): TransformedExerciseSession =>
  ({
    type: 'ExerciseSession',
    source: 'HealthKit',
    date: '2026-08-04',
    entry_date: '2026-08-04',
    timestamp: '2026-08-04T09:00:00.000Z',
    startTime: '2026-08-04T09:00:00.000Z',
    endTime: '2026-08-04T09:30:00.000Z',
    duration: 1800,
    activityType: 'Outdoor Walk',
    title: 'Outdoor Walk',
    raw_data: { uuid: 'abc', startTime: '2026-08-04T09:00:00.000Z' },
  }) as TransformedExerciseSession;

describe('attachWorkoutTelemetry', () => {
  it('leaves the session untouched when there is no telemetry', () => {
    // Devices and OS versions that yield nothing must produce exactly the
    // payload they did before telemetry existed.
    const session = makeSession();
    const before = JSON.stringify(session);
    attachWorkoutTelemetry(session, {});
    expect(JSON.stringify(session)).toBe(before);
  });

  it('ignores empty arrays and objects', () => {
    const session = makeSession();
    attachWorkoutTelemetry(session, {
      gps_points: [],
      hr_samples: [],
      laps: [],
      telemetry: {},
    });
    expect(session.gps_points).toBeUndefined();
    expect(session.telemetry).toBeUndefined();
  });

  it('attaches the telemetry it was given', () => {
    const session = makeSession();
    attachWorkoutTelemetry(session, {
      gps_points: [{ t: '2026-08-04T09:00:00.000Z', lat: 1, lon: 2 }],
      hr_samples: [{ t: '2026-08-04T09:00:00.000Z', bpm: 120 }],
      laps: [
        {
          lap_index: 1,
          start_time: '2026-08-04T09:00:00.000Z',
          end_time: '2026-08-04T09:15:00.000Z',
        },
      ],
      telemetry: { avg_heart_rate: 120 },
    });
    expect(session.gps_points).toHaveLength(1);
    expect(session.hr_samples).toHaveLength(1);
    expect(session.laps).toHaveLength(1);
    expect(session.telemetry).toEqual({ avg_heart_rate: 120 });
  });

  it('strips telemetry from raw_data so it is not uploaded twice', () => {
    // raw_data is stored verbatim server-side; leaving the arrays in would send
    // a second full copy of the track and series.
    const session = makeSession();
    session.raw_data = {
      uuid: 'abc',
      gps_points: [{ t: '2026-08-04T09:00:00.000Z', lat: 1, lon: 2 }],
      hr_samples: [{ t: '2026-08-04T09:00:00.000Z', bpm: 120 }],
    };
    attachWorkoutTelemetry(session, {
      gps_points: [{ t: '2026-08-04T09:00:00.000Z', lat: 1, lon: 2 }],
    });
    expect(session.raw_data).toEqual({ uuid: 'abc' });
  });
});

describe('stripTelemetryFromRawData', () => {
  it('returns the same reference when there is nothing to strip', () => {
    const raw = { uuid: 'abc' };
    expect(stripTelemetryFromRawData(raw)).toBe(raw);
  });

  it('does not mutate the original', () => {
    const raw = { uuid: 'abc', laps: [1] };
    stripTelemetryFromRawData(raw);
    expect(raw.laps).toEqual([1]);
  });

  it('passes through non-objects', () => {
    expect(stripTelemetryFromRawData(null)).toBeNull();
    expect(stripTelemetryFromRawData('text')).toBe('text');
  });
});
