import { describe, it, expect } from 'vitest';
import { classifyActivitySport } from '@workspace/shared';

/**
 * A new entry gets the default pair when classifyActivitySport says it is a
 * run, from what is known when the entry is created: its name, its exercise's
 * category and its notes (the provider's detail record is written later).
 * Each case is the name and notes a sync source writes for a run, so this
 * fails if a source stops being recognised.
 */
describe('runs are recognised at creation for every source', () => {
  it.each([
    [
      'Health Connect',
      'Running',
      null,
      'Source: HealthConnect, Activity Type: Running',
    ],
    [
      'Apple Health',
      'Running',
      null,
      'Source: HealthKit, Activity Type: Running',
    ],
    [
      'Strava (renamed run)',
      'Lunch tempo',
      'Cardio',
      'Synced from Strava. Type: Run. Moving time: 30m',
    ],
    [
      'Strava (trail)',
      'Evening trail',
      'Cardio',
      'Synced from Strava. Type: TrailRun.',
    ],
    ['Garmin', 'Running', 'cardio', 'Garmin Exercise: Running'],
    ['Garmin FIT import', 'Running', 'cardio', 'Garmin Exercise: Running'],
    ['Polar', 'RUNNING', null, 'Logged from Polar Flow: RUNNING. ID: 1.'],
    [
      'Intervals.icu',
      'Morning Run',
      null,
      'Synced from Intervals.icu. Type: Run.',
    ],
    ['Zepp', 'Outdoor running', null, 'Synced from ZeppBridge. Type: running.'],
    ['Manual diary entry', 'Running', 'Cardio', null],
    ['App treadmill run', 'Treadmill Running', 'Cardio', null],
  ])('%s', (_source, exerciseName, category, notes) => {
    expect(classifyActivitySport({ exerciseName, category, notes }).sport).toBe(
      'running'
    );
  });

  it.each([
    ['a walk', 'Walking', 'Source: HealthConnect, Activity Type: Walking'],
    ['a ride', 'Afternoon ride', 'Synced from Strava. Type: Ride.'],
    ['strength', 'Bench Press', null],
  ])('does not treat %s as a run', (_what, exerciseName, notes) => {
    expect(
      classifyActivitySport({ exerciseName, category: 'Cardio', notes }).sport
    ).not.toBe('running');
  });
});
