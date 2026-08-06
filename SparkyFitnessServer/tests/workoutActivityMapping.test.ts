import { describe, expect, it } from 'vitest';
import {
  mapActivityToModality,
  resolveActivityMapping,
} from '../services/workoutActivityMapping.js';

describe('mapActivityToModality', () => {
  it.each([
    'Outdoor Walk',
    'Walking',
    'Outdoor Run',
    'Running',
    'Hiking',
    'Outdoor Cycle',
    'Biking',
    'Rowing',
    'Open Water Swim',
    'Wheelchair Walk Pace',
  ])("treats '%s' as a distance activity", (label) => {
    expect(mapActivityToModality(label)).toEqual({
      modality: 'duration_distance',
      category: 'Cardio',
    });
  });

  it.each(['Elliptical', 'Stair Stepper', 'HIIT', 'Yoga', 'Pilates', 'Dance'])(
    "treats '%s' as duration-only",
    (label) => {
      expect(mapActivityToModality(label)).toEqual({
        modality: 'duration',
        category: 'Cardio',
      });
    }
  );

  it.each([
    'Traditional Strength Training',
    'Functional Strength Training',
    'Weight Lifting',
    'Core Training',
  ])("treats '%s' as set/rep based", (label) => {
    expect(mapActivityToModality(label)).toEqual({
      modality: 'weight_reps',
      category: 'Strength',
    });
  });

  // The distinction that motivated the stationary-qualifier logic: an indoor
  // walk still measures real distance from step length, but a stationary bike
  // reports a wheel-derived number with nowhere to plot it.
  it('keeps distance for an indoor walk', () => {
    expect(mapActivityToModality('Indoor Walk').modality).toBe(
      'duration_distance'
    );
  });

  it.each(['Indoor Cycle', 'Stationary Bike', 'Spin Class', 'Bike Ergometer'])(
    "drops distance for '%s'",
    (label) => {
      expect(mapActivityToModality(label).modality).toBe('duration');
    }
  );

  it('keeps distance for a treadmill run', () => {
    // A treadmill reports a real distance, unlike a stationary bike.
    expect(mapActivityToModality('Treadmill Running').modality).toBe(
      'duration_distance'
    );
  });

  it('is case and whitespace insensitive', () => {
    expect(mapActivityToModality('  OUTDOOR WALK  ').modality).toBe(
      'duration_distance'
    );
  });

  it('falls back to duration for unknown or missing labels', () => {
    expect(mapActivityToModality(undefined)).toEqual({
      modality: 'duration',
      category: 'Cardio',
    });
    expect(mapActivityToModality('')).toEqual({
      modality: 'duration',
      category: 'Cardio',
    });
    expect(mapActivityToModality('Quidditch').modality).toBe('duration');
  });

  it('prefers strength over a distance word in the same label', () => {
    expect(
      mapActivityToModality('Strength Training Walk Warmup').modality
    ).toBe('weight_reps');
  });
});

// Real labels emitted by ACTIVITY_MAP (HealthKit) and EXERCISE_MAP (Health
// Connect) in the mobile transformers. The lists here are word STEMS, and an
// inflected label silently falling through to the default is invisible without
// a case like these — "Hiking" does not contain "hike", nor "Dancing" "dance".
describe('mapActivityToModality — real provider labels', () => {
  it.each([
    'Walking',
    'Running',
    'Hiking',
    'Biking',
    'Cycling',
    'Hand Cycling',
    'Rowing',
    'Rowing Machine',
    'Swimming',
    'Skiing',
    'Downhill Skiing',
    'Cross Country Skiing',
    'Skating',
    'Ice Skating',
    'Skating Sports',
    'Paddling',
    'Paddle Sports',
    'Swim Bike Run',
    'Wheelchair Walk Pace',
    'Wheelchair Run Pace',
  ])("maps '%s' to duration_distance", (label) => {
    expect(mapActivityToModality(label).modality).toBe('duration_distance');
  });

  it.each([
    'Dance',
    'Dancing',
    'Cardio Dance',
    'Social Dance',
    'Dance Inspired Training',
    'Elliptical',
    'Stair Climbing',
    'High Intensity Interval Training',
  ])("maps '%s' to duration", (label) => {
    expect(mapActivityToModality(label).modality).toBe('duration');
  });
});

describe('resolveActivityMapping', () => {
  it('honours a valid explicit modality', () => {
    expect(resolveActivityMapping('Outdoor Walk', 'reps_only').modality).toBe(
      'reps_only'
    );
  });

  it('ignores an invalid explicit modality', () => {
    expect(resolveActivityMapping('Outdoor Walk', 'nonsense').modality).toBe(
      'duration_distance'
    );
  });

  it('does not let category derivation undo the stationary mapping', () => {
    // Every mapping uses category 'Cardio', which derives to
    // duration_distance. Routing the fallback through the category-based
    // resolver would give a stationary bike a distance modality.
    expect(resolveActivityMapping('Indoor Cycle', null).modality).toBe(
      'duration'
    );
    expect(resolveActivityMapping('Indoor Cycle', undefined).modality).toBe(
      'duration'
    );
  });
});
