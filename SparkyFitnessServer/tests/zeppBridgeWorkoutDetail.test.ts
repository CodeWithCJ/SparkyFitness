import { vi, beforeEach, describe, it, expect } from 'vitest';

vi.mock('../models/exerciseEntry.js', () => ({
  default: { getExerciseEntryById: vi.fn() },
}));
vi.mock('../models/workoutTelemetryRepository.js', () => ({
  getGpsPointsForExerciseEntry: vi.fn(),
}));
vi.mock('../services/exerciseEntryService.js', () => ({
  default: {
    attachGpsTrackToExerciseEntry: vi.fn().mockResolvedValue(undefined),
    attachLapsToExerciseEntry: vi.fn().mockResolvedValue(undefined),
    attachWatchTelemetryToExerciseEntry: vi.fn().mockResolvedValue(undefined),
  },
}));

import {
  applyWorkoutDetail,
  buildWorkoutTrack,
  needsWorkoutDetail,
} from '../integrations/zeppbridge/zeppBridgeWorkoutDetail.js';
import {
  addRecords,
  emptyRecordSet,
  type ZeppBridgeWorkout,
} from '../integrations/zeppbridge/zeppBridgeTypes.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import { getGpsPointsForExerciseEntry } from '../models/workoutTelemetryRepository.js';
import exerciseEntryService from '../services/exerciseEntryService.js';

const UID = 'user-1';
const ENTRY = 'entry-1';

function workout(extra: Record<string, unknown> = {}): ZeppBridgeWorkout {
  const set = emptyRecordSet();
  addRecords(set, [
    {
      record_type: 'workout',
      workout_id: 'w-1',
      start_time: '2026-11-03T07:30:00+02:00',
      route_point_count: 3,
      sample_count: 3,
      avg_hr: 140,
      ...extra,
    },
  ]);
  return set.workouts[0]!;
}

const route = [
  {
    timestamp: '2026-11-03T07:30:02+02:00',
    latitude: 52.1,
    longitude: 5.1,
    altitude_m: 10,
  },
  {
    timestamp: '2026-11-03T07:30:01+02:00',
    latitude: 52.0,
    longitude: 5.0,
    altitude_m: null,
  },
  { timestamp: '2026-11-03T07:30:03+02:00', latitude: 52.2, longitude: 5.2 },
];
const samples = [
  {
    timestamp: '2026-11-03T07:30:01+02:00',
    heart_rate: 120,
    cadence: 160,
    altitude_m: 9,
    distance_m: 0,
  },
  {
    timestamp: '2026-11-03T07:30:02+02:00',
    heart_rate: 125,
    cadence: 162,
    power_watts: 210,
    distance_m: 3,
  },
  { timestamp: '2026-11-03T07:30:03+02:00', heart_rate: 10, cadence: 164 },
];

describe('buildWorkoutTrack', () => {
  it('sorts the route and merges the nearest reading into each point', () => {
    const { points } = buildWorkoutTrack(workout({ route, samples }));

    expect(points.map((p) => p.t)).toEqual([
      '2026-11-03T05:30:01.000Z',
      '2026-11-03T05:30:02.000Z',
      '2026-11-03T05:30:03.000Z',
    ]);
    expect(points[0]).toEqual({
      t: '2026-11-03T05:30:01.000Z',
      lat: 52.0,
      lon: 5.0,
      // The route has no altitude here, so the sample's fills it.
      alt: 9,
      hr: 120,
      cad: 160,
      dist: 0,
    });
    expect(points[1]).toMatchObject({ hr: 125, power: 210, dist: 3 });
    // 10 bpm is not a heart rate, so it never reaches a point.
    expect(points[2]).not.toHaveProperty('hr');
    expect(points[2]).toMatchObject({ cad: 164 });
  });

  it('drops bad points and 0,0 fixes without failing the workout', () => {
    const { points } = buildWorkoutTrack(
      workout({
        route: [
          { timestamp: 'nope', latitude: 1, longitude: 1 },
          { timestamp: '2026-11-03T07:30:01+02:00', latitude: 0, longitude: 0 },
          {
            timestamp: '2026-11-03T07:30:02+02:00',
            latitude: 95,
            longitude: 1,
          },
          { timestamp: '2026-11-03T07:30:03+02:00', latitude: 'x' },
          route[0],
          route[2],
        ],
      })
    );
    expect(points).toHaveLength(2);
  });

  it('does not borrow a reading from a sample more than 5 seconds away', () => {
    const { points } = buildWorkoutTrack(
      workout({
        route: [route[1], route[0]],
        samples: [{ timestamp: '2026-11-03T07:31:00+02:00', heart_rate: 150 }],
      })
    );
    expect(points.every((p) => !('hr' in p))).toBe(true);
  });

  it('keeps only plausible heart rates in the series', () => {
    const { hrSamples } = buildWorkoutTrack(workout({ samples }));
    expect(hrSamples).toEqual([
      { t: '2026-11-03T05:30:01.000Z', bpm: 120 },
      { t: '2026-11-03T05:30:02.000Z', bpm: 125 },
    ]);
  });

  it('numbers laps in time order and drops impossible ones', () => {
    const { laps } = buildWorkoutTrack(
      workout({
        laps: [
          {
            index: 2,
            start_time: '2026-11-03T07:40:00+02:00',
            end_time: '2026-11-03T07:50:00+02:00',
            distance_m: 1500,
            avg_hr: 150,
          },
          {
            index: 1,
            start_time: '2026-11-03T07:30:00+02:00',
            end_time: '2026-11-03T07:40:00+02:00',
            distance_m: 1000,
          },
          {
            index: 3,
            start_time: '2026-11-03T08:00:00+02:00',
            end_time: '2026-11-03T07:59:00+02:00',
          },
        ],
      })
    );
    expect(laps).toEqual([
      {
        lap_index: 1,
        start_time: '2026-11-03T05:30:00.000Z',
        end_time: '2026-11-03T05:40:00.000Z',
        distance_meters: 1000,
      },
      {
        lap_index: 2,
        start_time: '2026-11-03T05:40:00.000Z',
        end_time: '2026-11-03T05:50:00.000Z',
        distance_meters: 1500,
        avg_heart_rate: 150,
      },
    ]);
  });
});

describe('needsWorkoutDetail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('needs nothing for a workout with no route and no samples', async () => {
    expect(
      await needsWorkoutDetail(
        UID,
        ENTRY,
        workout({ route_point_count: 0, sample_count: 0 })
      )
    ).toBe(false);
    expect(getGpsPointsForExerciseEntry).not.toHaveBeenCalled();
  });

  it('needs the route while the entry has no GPS points', async () => {
    vi.mocked(getGpsPointsForExerciseEntry).mockResolvedValue(null);
    expect(
      await needsWorkoutDetail(UID, ENTRY, workout({ sample_count: 0 }))
    ).toBe(true);
  });

  it('does not chase a series for a workout whose summary has no heart rate', async () => {
    expect(
      await needsWorkoutDetail(
        UID,
        ENTRY,
        workout({
          route_point_count: 0,
          sample_count: 181,
          avg_hr: null,
          max_hr: null,
          min_hr: null,
        })
      )
    ).toBe(false);
    expect(exerciseEntryRepository.getExerciseEntryById).not.toHaveBeenCalled();
  });

  it('is satisfied once the route and a heart rate series are stored', async () => {
    vi.mocked(getGpsPointsForExerciseEntry).mockResolvedValue({} as never);
    vi.mocked(exerciseEntryRepository.getExerciseEntryById).mockResolvedValue({
      watch_telemetry_observed_at: '2026-11-03T05:50:00.000Z',
    });
    expect(await needsWorkoutDetail(UID, ENTRY, workout())).toBe(false);
  });

  it('needs the heart rate series of an indoor workout that has none', async () => {
    vi.mocked(exerciseEntryRepository.getExerciseEntryById).mockResolvedValue({
      watch_telemetry_observed_at: null,
    });
    expect(
      await needsWorkoutDetail(
        UID,
        ENTRY,
        workout({ route_point_count: 0, sample_count: 600 })
      )
    ).toBe(true);
  });
});

describe('applyWorkoutDetail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores the route with its lap windows, then the heart rate series', async () => {
    const applied = await applyWorkoutDetail(
      UID,
      UID,
      ENTRY,
      workout({
        route,
        samples,
        laps: [
          {
            index: 1,
            start_time: '2026-11-03T07:30:00+02:00',
            end_time: '2026-11-03T07:30:03+02:00',
          },
        ],
      })
    );

    expect(applied).toEqual({ route: true, heartRate: true });
    const [, , entryId, track] = vi.mocked(
      exerciseEntryService.attachGpsTrackToExerciseEntry
    ).mock.calls[0]!;
    expect(entryId).toBe(ENTRY);
    expect(track.points).toHaveLength(3);
    expect(track.laps).toEqual([
      {
        lap_index: 1,
        start_time: '2026-11-03T05:30:00.000Z',
        end_time: '2026-11-03T05:30:03.000Z',
      },
    ]);
    expect(
      exerciseEntryService.attachLapsToExerciseEntry
    ).not.toHaveBeenCalled();
    const watch = vi.mocked(
      exerciseEntryService.attachWatchTelemetryToExerciseEntry
    ).mock.calls[0]!;
    expect(watch[3]).toHaveLength(2);
    expect(watch[9]).toBe('ZeppBridge');
  });

  it('stores laps and heart rate only, for a workout without a route', async () => {
    const applied = await applyWorkoutDetail(
      UID,
      UID,
      ENTRY,
      workout({
        route_point_count: 0,
        samples,
        laps: [
          {
            index: 1,
            start_time: '2026-11-03T07:30:00+02:00',
            end_time: '2026-11-03T07:40:00+02:00',
            distance_m: 1000,
            avg_hr: 140,
          },
        ],
      })
    );

    expect(applied).toEqual({ route: false, heartRate: true });
    expect(
      exerciseEntryService.attachGpsTrackToExerciseEntry
    ).not.toHaveBeenCalled();
    expect(
      vi.mocked(exerciseEntryService.attachLapsToExerciseEntry).mock
        .calls[0]![3]
    ).toEqual({
      laps: [
        expect.objectContaining({
          lap_index: 1,
          distance_meters: 1000,
          avg_heart_rate: 140,
        }),
      ],
    });
  });

  it('does nothing for a workout with no usable detail', async () => {
    const applied = await applyWorkoutDetail(
      UID,
      UID,
      ENTRY,
      workout({ route: [], samples: [] })
    );
    expect(applied).toEqual({ route: false, heartRate: false });
    expect(
      exerciseEntryService.attachWatchTelemetryToExerciseEntry
    ).not.toHaveBeenCalled();
  });
});
