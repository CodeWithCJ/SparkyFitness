import { describe, it, expect } from 'vitest';
import {
  classifyActivitySport,
  mapRawSportValue,
  toPrSportGroup,
} from '@workspace/shared';

describe('mapRawSportValue', () => {
  it('maps every casing convention providers use', () => {
    // Garmin / FIT snake_case
    expect(mapRawSportValue('trail_running')).toBe('running');
    expect(mapRawSportValue('treadmill_running')).toBe('running');
    expect(mapRawSportValue('indoor_cycling')).toBe('cycling');
    expect(mapRawSportValue('gravel_cycling')).toBe('cycling');
    expect(mapRawSportValue('open_water_swimming')).toBe('swimming');
    expect(mapRawSportValue('casual_walking')).toBe('walking');
    // Strava PascalCase
    expect(mapRawSportValue('VirtualRide')).toBe('cycling');
    expect(mapRawSportValue('EBikeRide')).toBe('cycling');
    expect(mapRawSportValue('TrailRun')).toBe('running');
    expect(mapRawSportValue('WeightTraining')).toBe('strength');
    // Withings / Oura / Polar labels
    expect(mapRawSportValue('Indoor Cycling')).toBe('cycling');
    expect(mapRawSportValue('LAP_SWIMMING')).toBe('swimming');
    expect(mapRawSportValue('running')).toBe('running');
    // Health Connect constant style
    expect(mapRawSportValue('EXERCISE_TYPE_RUNNING')).toBe('running');
  });

  it('returns other for sports outside the taxonomy', () => {
    expect(mapRawSportValue('tennis')).toBe('other');
    expect(mapRawSportValue('')).toBe('other');
    expect(mapRawSportValue(null)).toBe('other');
  });
});

describe('classifyActivitySport — provider-declared', () => {
  it('reads the Garmin typeKey from the activity blob', () => {
    expect(
      classifyActivitySport({
        exerciseName: 'Antwerp Walking',
        category: 'cardio',
        providerName: 'garmin',
        detailData: { activityType: { typeKey: 'walking' } },
      })
    ).toEqual({ sport: 'walking', confidence: 'declared' });
  });

  it('reads the Garmin FIT sport nested under activity', () => {
    expect(
      classifyActivitySport({
        providerName: 'garmin_fit',
        detailData: { activity: { activityType: { typeKey: 'cycling' } } },
      })
    ).toEqual({ sport: 'cycling', confidence: 'declared' });
  });

  it('trusts the Strava sport_type over a user-written activity title', () => {
    // Strava exercise_name is a free-text title the athlete chose, so keyword
    // matching on it is exactly what must NOT decide the sport.
    expect(
      classifyActivitySport({
        exerciseName: 'Morning Run',
        category: 'Cardio',
        providerName: 'Strava',
        detailData: { sport_type: 'Ride', type: 'Ride' },
      })
    ).toEqual({ sport: 'cycling', confidence: 'declared' });
  });

  it('classifies an emoji-titled Strava ride', () => {
    expect(
      classifyActivitySport({
        exerciseName: '🚴 lunch loop',
        providerName: 'Strava',
        detailData: { sport_type: 'GravelRide' },
      })
    ).toEqual({ sport: 'cycling', confidence: 'declared' });
  });

  it('reads Polar detailed-sport-info, Fitbit parent name, and Oura activity', () => {
    expect(
      classifyActivitySport({
        providerName: 'Polar',
        detailData: { 'detailed-sport-info': 'ROAD_BIKING', sport: 'CYCLING' },
      }).sport
    ).toBe('cycling');
    expect(
      classifyActivitySport({
        providerName: 'Fitbit',
        detailData: {
          activityParentName: 'Running',
          activityName: 'Treadmill',
        },
      }).sport
    ).toBe('running');
    expect(
      classifyActivitySport({
        providerName: 'Oura',
        detailData: { activity: 'walking' },
      }).sport
    ).toBe('walking');
  });

  it('reads the Google Health exercise type', () => {
    expect(
      classifyActivitySport({
        providerName: 'Google Health',
        detailData: { exercise: { exerciseType: 'RUNNING' } },
      }).sport
    ).toBe('running');
  });

  it('parses HealthKit blobs that were stringified into the jsonb column', () => {
    expect(
      classifyActivitySport({
        exerciseName: 'Outdoor Cycle',
        category: 'Cardio',
        providerName: 'HealthKit',
        detailData: JSON.stringify({ activityType: 'Cycling' }),
      })
    ).toEqual({ sport: 'cycling', confidence: 'declared' });
  });

  it('recovers the Withings sport from the exercise source id', () => {
    // Withings only stores workout.data in its blob; the numeric sport enum
    // lives on workout.category, which survives on exercises.source_id.
    expect(
      classifyActivitySport({
        providerName: 'Withings',
        detailData: { calories: 300, steps: 1000 },
        exerciseSourceId: 'withings-workout-308',
      })
    ).toEqual({ sport: 'cycling', confidence: 'declared' });
    expect(
      classifyActivitySport({
        providerName: 'Withings',
        detailData: {},
        exerciseSourceId: 'withings-workout-2',
      }).sport
    ).toBe('running');
  });

  it('treats Hevy as strength', () => {
    expect(
      classifyActivitySport({
        providerName: 'Hevy',
        detailData: { workout: { title: 'Push Day' } },
      })
    ).toEqual({ sport: 'strength', confidence: 'declared' });
  });
});

describe('classifyActivitySport — notes templates', () => {
  it('falls back to the Garmin notes typeKey when the details row is missing', () => {
    expect(
      classifyActivitySport({
        exerciseName: 'Antwerp Walking',
        category: 'cardio',
        notes: 'Garmin Activity: Antwerp Walking (walking)',
      })
    ).toEqual({ sport: 'walking', confidence: 'inferred' });
  });

  it('reads the HealthKit notes template', () => {
    expect(
      classifyActivitySport({
        exerciseName: 'Cycling',
        notes: 'Source: HealthKit, Activity Type: Cycling',
      })
    ).toEqual({ sport: 'cycling', confidence: 'inferred' });
  });

  it('reads the Strava notes template', () => {
    expect(
      classifyActivitySport({
        exerciseName: 'evening spin',
        notes: 'Synced from Strava. Type: VirtualRide. Moving time: 45min.',
      }).sport
    ).toBe('cycling');
  });
});

describe('classifyActivitySport — free-text names', () => {
  it('classifies manual entries by name', () => {
    expect(classifyActivitySport({ exerciseName: 'Antwerp Walking' })).toEqual({
      sport: 'walking',
      confidence: 'inferred',
    });
    expect(classifyActivitySport({ exerciseName: 'Morning Run' }).sport).toBe(
      'running'
    );
    expect(classifyActivitySport({ exerciseName: 'Lap Swimming' }).sport).toBe(
      'swimming'
    );
  });

  it('refuses to guess when a name names two sports', () => {
    expect(
      classifyActivitySport({ exerciseName: 'Bike then Run Brick' })
    ).toEqual({ sport: 'other', confidence: 'inferred' });
  });

  it('does not match sport words inside unrelated words', () => {
    expect(
      classifyActivitySport({ exerciseName: 'Runway Photoshoot' }).sport
    ).toBe('other');
    expect(
      classifyActivitySport({ exerciseName: 'Swimsuit Shopping' }).sport
    ).toBe('other');
    expect(
      classifyActivitySport({ exerciseName: 'Lap around the park' }).sport
    ).toBe('other');
  });

  it('never reads the catch-all cardio category as running', () => {
    // The Garmin mapper collapses running, walking, cycling, and swimming all
    // into 'cardio', so it cannot imply any specific sport.
    expect(classifyActivitySport({ category: 'Cardio' }).sport).toBe('other');
    expect(classifyActivitySport({ category: 'cardio' }).sport).toBe('other');
    expect(classifyActivitySport({ category: 'general' }).sport).toBe('other');
    // A specific category is still usable.
    expect(classifyActivitySport({ category: 'Running' }).sport).toBe(
      'running'
    );
  });

  it('returns other with no signal at all', () => {
    expect(classifyActivitySport({})).toEqual({
      sport: 'other',
      confidence: 'inferred',
    });
  });
});

describe('toPrSportGroup', () => {
  it('folds hiking in with walking and keeps the rest distinct', () => {
    expect(toPrSportGroup('running')).toBe('run');
    expect(toPrSportGroup('cycling')).toBe('ride');
    expect(toPrSportGroup('walking')).toBe('walk');
    expect(toPrSportGroup('hiking')).toBe('walk');
    expect(toPrSportGroup('swimming')).toBe('swim');
    expect(toPrSportGroup('rowing')).toBe('other');
    expect(toPrSportGroup('strength')).toBe('other');
  });
});
