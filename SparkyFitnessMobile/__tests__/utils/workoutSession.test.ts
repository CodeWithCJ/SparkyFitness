import {
  CATEGORY_ICON_MAP,
  getWorkoutIcon,
  getSourceLabel,
  formatDuration,
  getFirstImage,
  getSessionCalories,
  getWorkoutSummary,
  buildSessionSubtitle,
  calculateExerciseStats,
  calculateCaloriesBurned,
  calculateActiveCalories,
  calculateOtherExerciseCalories,
  calculateExerciseDuration,
  buildExercisesPayload,
  buildPresetExercisesPayload,
} from '../../src/utils/workoutSession';
import type { ExerciseSessionResponse } from '@workspace/shared';
import { presetSessionExerciseRequestSchema } from '@workspace/shared';
import type { WorkoutDraftExercise } from '../../src/types/drafts';

type IndividualSession = Extract<ExerciseSessionResponse, { type: 'individual' }>;
type PresetSession = Extract<ExerciseSessionResponse, { type: 'preset' }>;

/** Format a number the same way the source does (runtime-locale toLocaleString). */
const fmt = (n: number) => n.toLocaleString();

const makeIndividual = (overrides?: Partial<IndividualSession>): IndividualSession => ({
  type: 'individual',
  id: 'ind-1',
  entry_date: '2026-03-20',
  exercise_id: 'ex-1',
  name: null,
  duration_minutes: 30,
  calories_burned: 300,
  distance: null,
  avg_heart_rate: null,
  notes: null,
  source: null,
  sets: [],
  exercise_snapshot: {
    id: 'ex-1',
    name: 'Running',
    category: 'Cardio',
    calories_per_hour: 600,
    source: 'system',
    images: [],
  },
  activity_details: [],
  ...overrides,
});

const makePreset = (overrides?: Partial<PresetSession>): PresetSession => ({
  type: 'preset',
  id: 'pre-1',
  entry_date: '2026-03-20',
  workout_preset_id: null,
  name: 'Push Day',
  description: null,
  notes: null,
  source: 'sparky',
  total_duration_minutes: 60,
  exercises: [],
  activity_details: [],
  ...overrides,
});

describe('workoutSession', () => {
  describe('getWorkoutIcon', () => {
    it('returns exercise-weights for preset sessions', () => {
      expect(getWorkoutIcon(makePreset())).toBe('exercise-weights');
    });

    it('uses exact name match from CATEGORY_ICON_MAP', () => {
      const session = makeIndividual({
        name: 'Swimming',
        exercise_snapshot: { id: 'ex-1', name: 'Swimming', category: 'Cardio', calories_per_hour: 500, source: 'system' },
      });
      expect(getWorkoutIcon(session)).toBe('exercise-swimming');
    });

    it('uses category match for non-Cardio categories', () => {
      const session = makeIndividual({
        name: 'My Custom Workout',
        exercise_snapshot: { id: 'ex-1', name: 'My Custom Workout', category: 'Strength', calories_per_hour: 400, source: 'system' },
      });
      expect(getWorkoutIcon(session)).toBe('exercise-weights');
    });

    it('skips Cardio category for keyword matching first', () => {
      const session = makeIndividual({
        name: 'swimming laps',
        exercise_snapshot: { id: 'ex-1', name: 'swimming laps', category: 'Cardio', calories_per_hour: 500, source: 'system' },
      });
      expect(getWorkoutIcon(session)).toBe('exercise-swimming');
    });

    it('falls back to Cardio category when no keyword matches', () => {
      const session = makeIndividual({
        name: 'Unknown Cardio Activity',
        exercise_snapshot: { id: 'ex-1', name: 'Unknown Cardio Activity', category: 'Cardio', calories_per_hour: 300, source: 'system' },
      });
      expect(getWorkoutIcon(session)).toBe('exercise-running');
    });

    it('returns exercise-default when nothing matches', () => {
      const session = makeIndividual({
        name: 'Meditation',
        exercise_snapshot: { id: 'ex-1', name: 'Meditation', category: 'Mindfulness', calories_per_hour: 50, source: 'system' },
      });
      expect(getWorkoutIcon(session)).toBe('exercise-default');
    });

    it('uses exercise_snapshot.name when session name is null', () => {
      const session = makeIndividual({
        name: null,
        exercise_snapshot: { id: 'ex-1', name: 'Cycling', category: 'Cardio', calories_per_hour: 500, source: 'system' },
      });
      expect(getWorkoutIcon(session)).toBe('exercise-cycling');
    });

    it('handles keyword matching for strength-related names', () => {
      const session = makeIndividual({
        name: 'Traditional Strength Training',
        exercise_snapshot: { id: 'ex-1', name: 'Traditional Strength Training', category: 'Cardio', calories_per_hour: 400, source: 'system' },
      });
      expect(getWorkoutIcon(session)).toBe('exercise-weights');
    });

    it('handles keyword matching for stair-related names', () => {
      const session = makeIndividual({
        name: 'Stair Climbing',
        exercise_snapshot: { id: 'ex-1', name: 'Stair Climbing', category: null, calories_per_hour: 400, source: 'system' },
      });
      expect(getWorkoutIcon(session)).toBe('exercise-stair');
    });

    it('handles null exercise_snapshot', () => {
      const session = makeIndividual({
        name: null,
        exercise_snapshot: null as any,
      });
      expect(getWorkoutIcon(session)).toBe('exercise-default');
    });

    it('matches category names that are in CATEGORY_ICON_MAP', () => {
      for (const [category, expectedIcon] of Object.entries(CATEGORY_ICON_MAP)) {
        if (category === 'Cardio') continue; // Cardio is only a fallback
        const session = makeIndividual({
          name: 'Unknown',
          exercise_snapshot: { id: 'ex-1', name: 'Unknown', category, calories_per_hour: 300, source: 'system' },
        });
        expect(getWorkoutIcon(session)).toBe(expectedIcon);
      }
    });
  });

  describe('getSourceLabel', () => {
    it('returns Sparky for null source', () => {
      expect(getSourceLabel(null)).toEqual({ label: 'Sparky', isSparky: true });
    });

    it('returns Sparky for "manual" source', () => {
      expect(getSourceLabel('manual')).toEqual({ label: 'Sparky', isSparky: true });
    });

    it('returns Sparky for "sparky" source', () => {
      expect(getSourceLabel('sparky')).toEqual({ label: 'Sparky', isSparky: true });
    });

    it('returns Apple Health for HealthKit source', () => {
      expect(getSourceLabel('HealthKit')).toEqual({ label: 'Apple Health', isSparky: false });
    });

    it('returns Garmin for garmin source (lowercase)', () => {
      expect(getSourceLabel('garmin')).toEqual({ label: 'Garmin', isSparky: false });
    });

    it('returns Garmin for Garmin source (capitalized)', () => {
      expect(getSourceLabel('Garmin')).toEqual({ label: 'Garmin', isSparky: false });
    });

    it('returns Health Connect for Health Connect source', () => {
      expect(getSourceLabel('Health Connect')).toEqual({ label: 'Health Connect', isSparky: false });
    });

    it('returns the source string as-is for unknown sources', () => {
      expect(getSourceLabel('MyFitnessPal')).toEqual({ label: 'MyFitnessPal', isSparky: false });
    });
  });

  describe('formatDuration', () => {
    it('formats minutes less than 60', () => {
      expect(formatDuration(30)).toBe('30 min');
    });

    it('formats exactly 60 minutes', () => {
      expect(formatDuration(60)).toBe('1h');
    });

    it('formats hours and minutes', () => {
      expect(formatDuration(90)).toBe('1h 30m');
    });

    it('rounds fractional minutes', () => {
      expect(formatDuration(30.6)).toBe('31 min');
    });

    it('formats hours without remaining minutes', () => {
      expect(formatDuration(120)).toBe('2h');
    });

    it('formats zero minutes', () => {
      expect(formatDuration(0)).toBe('0 min');
    });
  });

  describe('getFirstImage', () => {
    it('returns the first image from an individual session', () => {
      const session = makeIndividual({
        exercise_snapshot: {
          id: 'ex-1',
          name: 'Running',
          category: 'Cardio',
          calories_per_hour: 600,
          source: 'system',
          images: ['img1.jpg', 'img2.jpg'],
        },
      });
      expect(getFirstImage(session)).toBe('img1.jpg');
    });

    it('returns null when individual session has no images', () => {
      const session = makeIndividual({
        exercise_snapshot: {
          id: 'ex-1',
          name: 'Running',
          category: 'Cardio',
          calories_per_hour: 600,
          source: 'system',
          images: [],
        },
      });
      expect(getFirstImage(session)).toBeNull();
    });

    it('returns null when individual session has no snapshot', () => {
      const session = makeIndividual({
        exercise_snapshot: null as any,
      });
      expect(getFirstImage(session)).toBeNull();
    });

    it('returns the first image from a preset session exercises', () => {
      const session = makePreset({
        exercises: [
          {
            exercise_id: 'ex-1',
            exercise_snapshot: { id: 'ex-1', name: 'Bench', category: 'Strength', calories_per_hour: 400, source: 'system', images: [] },
            sets: [],
            calories_burned: 100,
            duration_minutes: 20,
          } as any,
          {
            exercise_id: 'ex-2',
            exercise_snapshot: { id: 'ex-2', name: 'Squat', category: 'Strength', calories_per_hour: 500, source: 'system', images: ['squat.jpg'] },
            sets: [],
            calories_burned: 150,
            duration_minutes: 25,
          } as any,
        ],
      });
      expect(getFirstImage(session)).toBe('squat.jpg');
    });

    it('returns null when preset session has no exercises with images', () => {
      const session = makePreset({ exercises: [] });
      expect(getFirstImage(session)).toBeNull();
    });
  });

  describe('getSessionCalories', () => {
    it('sums exercise calories for preset sessions', () => {
      const session = makePreset({
        exercises: [
          { exercise_id: 'ex-1', calories_burned: 150, duration_minutes: 20, sets: [] } as any,
          { exercise_id: 'ex-2', calories_burned: 200, duration_minutes: 25, sets: [] } as any,
        ],
      });
      expect(getSessionCalories(session)).toBe(350);
    });

    it('returns calories_burned for individual sessions', () => {
      const session = makeIndividual({ calories_burned: 500 });
      expect(getSessionCalories(session)).toBe(500);
    });

    it('returns 0 for individual sessions with no calories', () => {
      const session = makeIndividual({ calories_burned: 0 });
      expect(getSessionCalories(session)).toBe(0);
    });

    it('returns 0 for preset sessions with no exercises', () => {
      const session = makePreset({ exercises: [] });
      expect(getSessionCalories(session)).toBe(0);
    });
  });

  describe('getWorkoutSummary', () => {
    it('returns summary for preset session', () => {
      const session = makePreset({
        name: 'Leg Day',
        total_duration_minutes: 45,
        exercises: [
          { exercise_id: 'ex-1', calories_burned: 200, duration_minutes: 25, sets: [] } as any,
        ],
      });
      const summary = getWorkoutSummary(session);
      expect(summary.name).toBe('Leg Day');
      expect(summary.duration).toBe(45);
      expect(summary.calories).toBe(200);
    });

    it('returns summary for individual session with name', () => {
      const session = makeIndividual({
        name: 'Morning Run',
        duration_minutes: 30,
        calories_burned: 300,
      });
      const summary = getWorkoutSummary(session);
      expect(summary.name).toBe('Morning Run');
      expect(summary.duration).toBe(30);
      expect(summary.calories).toBe(300);
    });

    it('falls back to snapshot name when session name is null', () => {
      const session = makeIndividual({
        name: null,
        exercise_snapshot: { id: 'ex-1', name: 'Cycling', category: 'Cardio', calories_per_hour: 500, source: 'system' },
      });
      expect(getWorkoutSummary(session).name).toBe('Cycling');
    });

    it('falls back to "Unknown exercise" when no name available', () => {
      const session = makeIndividual({
        name: null,
        exercise_snapshot: null as any,
      });
      expect(getWorkoutSummary(session).name).toBe('Unknown exercise');
    });
  });

  describe('buildSessionSubtitle', () => {
    describe('preset sessions', () => {
      it('shows exercise count and sets', () => {
        const session = makePreset({
          exercises: [
            {
              exercise_id: 'ex-1',
              exercise_snapshot: null as any,
              sets: [{ weight: null, reps: null }],
              calories_burned: 0,
              duration_minutes: 0,
            } as any,
            {
              exercise_id: 'ex-2',
              exercise_snapshot: null as any,
              sets: [{ weight: null, reps: null }, { weight: null, reps: null }],
              calories_burned: 0,
              duration_minutes: 0,
            } as any,
          ],
        });
        expect(buildSessionSubtitle(session, 60, 300)).toBe('2 exercises · 3 sets');
      });

      it('shows singular "exercise" for one exercise', () => {
        const session = makePreset({
          exercises: [
            {
              exercise_id: 'ex-1',
              exercise_snapshot: null as any,
              sets: [{ weight: 50, reps: 10 }],
              calories_burned: 0,
              duration_minutes: 0,
            } as any,
          ],
        });
        expect(buildSessionSubtitle(session, 30, 100)).toContain('1 exercise');
      });

      it('includes volume in kg when sets have weight and reps', () => {
        const session = makePreset({
          exercises: [
            {
              exercise_id: 'ex-1',
              exercise_snapshot: null as any,
              sets: [
                { weight: 100, reps: 5 },  // 500 kg
                { weight: 80, reps: 8 },   // 640 kg
              ],
              calories_burned: 0,
              duration_minutes: 0,
            } as any,
          ],
        });
        // 500 + 640 = 1140 kg
        expect(buildSessionSubtitle(session, 60, 300)).toBe(`1 exercise · 2 sets · ${fmt(1140)} kg`);
      });

      it('converts volume to lbs when weightUnit is lbs', () => {
        const session = makePreset({
          exercises: [
            {
              exercise_id: 'ex-1',
              exercise_snapshot: null as any,
              sets: [{ weight: 100, reps: 10 }], // 1000 kg volume
              calories_burned: 0,
              duration_minutes: 0,
            } as any,
          ],
        });
        const result = buildSessionSubtitle(session, 60, 300, 'lbs');
        expect(result).toContain('lbs');
        // 1000 kg * 2.20462 ≈ 2205 lbs
        expect(result).toContain(`${fmt(2205)}`);
      });

      it('omits volume when all weights are zero or null', () => {
        const session = makePreset({
          exercises: [
            {
              exercise_id: 'ex-1',
              exercise_snapshot: null as any,
              sets: [{ weight: 0, reps: 10 }, { weight: null, reps: 5 }],
              calories_burned: 0,
              duration_minutes: 0,
            } as any,
          ],
        });
        expect(buildSessionSubtitle(session, 60, 300)).toBe('1 exercise · 2 sets');
      });

      it('omits sets count when no sets exist', () => {
        const session = makePreset({
          exercises: [
            {
              exercise_id: 'ex-1',
              exercise_snapshot: null as any,
              sets: [],
              calories_burned: 0,
              duration_minutes: 0,
            } as any,
          ],
        });
        expect(buildSessionSubtitle(session, 60, 300)).toBe('1 exercise');
      });
    });

    describe('individual with multiple sets', () => {
      it('shows sets count with duration and calories', () => {
        const session = makeIndividual({
          sets: [
            { weight: null, reps: null },
            { weight: null, reps: null },
            { weight: null, reps: null },
          ] as any,
        });
        expect(buildSessionSubtitle(session, 45, 200)).toBe('3 sets · 45 min · 200 Cal');
      });

      it('includes volume when sets have weight and reps', () => {
        const session = makeIndividual({
          sets: [
            { weight: 60, reps: 10 },  // 600 kg
            { weight: 60, reps: 8 },   // 480 kg
          ] as any,
        });
        // 1080 kg total
        expect(buildSessionSubtitle(session, 30, 150)).toBe(`2 sets · ${fmt(1080)} kg · 30 min · 150 Cal`);
      });

      it('converts volume to lbs', () => {
        const session = makeIndividual({
          sets: [
            { weight: 50, reps: 10 },  // 500 kg
            { weight: 50, reps: 10 },  // 500 kg
          ] as any,
        });
        const result = buildSessionSubtitle(session, 20, 100, 'lbs');
        // 1000 kg * 2.20462 ≈ 2205 lbs
        expect(result).toBe(`2 sets · ${fmt(2205)} lbs · 20 min · 100 Cal`);
      });

      it('omits volume when weights are zero', () => {
        const session = makeIndividual({
          sets: [
            { weight: 0, reps: 10 },
            { weight: 0, reps: 10 },
          ] as any,
        });
        expect(buildSessionSubtitle(session, 30, 200)).toBe('2 sets · 30 min · 200 Cal');
      });

      it('omits duration when zero', () => {
        const session = makeIndividual({
          sets: [
            { weight: 40, reps: 10 },
            { weight: 40, reps: 10 },
          ] as any,
        });
        // 800 kg volume
        expect(buildSessionSubtitle(session, 0, 150)).toBe('2 sets · 800 kg · 150 Cal');
      });

      it('omits calories when zero', () => {
        const session = makeIndividual({
          sets: [
            { weight: null, reps: null },
            { weight: null, reps: null },
          ] as any,
        });
        expect(buildSessionSubtitle(session, 20, 0)).toBe('2 sets · 20 min');
      });

      it('shows only set count when volume, duration, and calories are all zero', () => {
        const session = makeIndividual({
          sets: [
            { weight: 0, reps: 0 },
            { weight: null, reps: null },
          ] as any,
        });
        expect(buildSessionSubtitle(session, 0, 0)).toBe('2 sets');
      });
    });

    describe('individual activity (single or no sets)', () => {
      it('shows duration and calories', () => {
        const session = makeIndividual();
        expect(buildSessionSubtitle(session, 30, 300)).toBe('30 min · 300 Cal');
      });

      it('includes distance in km', () => {
        const session = makeIndividual({ distance: 5.5 });
        expect(buildSessionSubtitle(session, 30, 300)).toBe('30 min · 5.5 km · 300 Cal');
      });

      it('converts distance to miles', () => {
        const session = makeIndividual({ distance: 10 }); // 10 km
        const result = buildSessionSubtitle(session, 60, 500, 'kg', 'miles');
        // 10 km * 0.621371 ≈ 6.2 mi
        expect(result).toBe('1h · 6.2 mi · 500 Cal');
      });

      it('omits distance when null', () => {
        const session = makeIndividual({ distance: null });
        expect(buildSessionSubtitle(session, 45, 250)).toBe('45 min · 250 Cal');
      });

      it('omits distance when zero', () => {
        const session = makeIndividual({ distance: 0 });
        expect(buildSessionSubtitle(session, 45, 250)).toBe('45 min · 250 Cal');
      });

      it('omits duration when zero', () => {
        const session = makeIndividual();
        expect(buildSessionSubtitle(session, 0, 300)).toBe('300 Cal');
      });

      it('omits calories when zero', () => {
        const session = makeIndividual();
        expect(buildSessionSubtitle(session, 30, 0)).toBe('30 min');
      });

      it('returns empty string when all values are zero/null', () => {
        const session = makeIndividual({ distance: null });
        expect(buildSessionSubtitle(session, 0, 0)).toBe('');
      });

      it('shows set/volume info for a single-set strength session', () => {
        const session = makeIndividual({
          sets: [{ weight: 100, reps: 10 }] as any,
          distance: 5,
        });
        // Single set still enters the sets branch — weight 100 * reps 10 = 1000 kg volume
        expect(buildSessionSubtitle(session, 30, 200)).toBe(`1 set · ${fmt(1000)} kg · 30 min · 200 Cal`);
      });
    });
  });

  describe('calculateExerciseStats', () => {
    it('returns zeros for empty array', () => {
      expect(calculateExerciseStats([])).toEqual({
        caloriesBurned: 0,
        activeCalories: 0,
        otherExerciseCalories: 0,
        durationMinutes: 0,
      });
    });

    it('accumulates preset session calories and duration', () => {
      const sessions = [
        makePreset({
          total_duration_minutes: 45,
          exercises: [
            { exercise_id: 'ex-1', calories_burned: 200, duration_minutes: 20, sets: [] } as any,
            { exercise_id: 'ex-2', calories_burned: 150, duration_minutes: 25, sets: [] } as any,
          ],
        }),
      ];
      const stats = calculateExerciseStats(sessions);
      expect(stats.caloriesBurned).toBe(350);
      expect(stats.otherExerciseCalories).toBe(350);
      expect(stats.activeCalories).toBe(0);
      expect(stats.durationMinutes).toBe(45);
    });

    it('accumulates individual session calories and duration', () => {
      const sessions = [
        makeIndividual({ calories_burned: 300, duration_minutes: 30 }),
        makeIndividual({ calories_burned: 200, duration_minutes: 20 }),
      ];
      const stats = calculateExerciseStats(sessions);
      expect(stats.caloriesBurned).toBe(500);
      expect(stats.otherExerciseCalories).toBe(500);
      expect(stats.activeCalories).toBe(0);
      expect(stats.durationMinutes).toBe(50);
    });

    it('separates Active Calories entries from other exercises', () => {
      const sessions = [
        makeIndividual({
          calories_burned: 400,
          duration_minutes: 0,
          exercise_snapshot: {
            id: 'ac-1',
            name: 'Active Calories',
            category: 'Cardio',
            calories_per_hour: 0,
            source: 'system',
          },
        }),
        makeIndividual({ calories_burned: 300, duration_minutes: 30 }),
      ];
      const stats = calculateExerciseStats(sessions);
      expect(stats.caloriesBurned).toBe(700);
      expect(stats.activeCalories).toBe(400);
      expect(stats.otherExerciseCalories).toBe(300);
      expect(stats.durationMinutes).toBe(30);
    });

    it('does not count Active Calories duration', () => {
      const sessions = [
        makeIndividual({
          calories_burned: 500,
          duration_minutes: 60,
          exercise_snapshot: {
            id: 'ac-1',
            name: 'Active Calories',
            category: 'Cardio',
            calories_per_hour: 0,
            source: 'system',
          },
        }),
      ];
      const stats = calculateExerciseStats(sessions);
      expect(stats.durationMinutes).toBe(0);
    });

    it('handles mixed preset and individual sessions', () => {
      const sessions: ExerciseSessionResponse[] = [
        makePreset({
          total_duration_minutes: 60,
          exercises: [
            { exercise_id: 'ex-1', calories_burned: 250, duration_minutes: 30, sets: [] } as any,
          ],
        }),
        makeIndividual({ calories_burned: 300, duration_minutes: 30 }),
        makeIndividual({
          calories_burned: 150,
          duration_minutes: 0,
          exercise_snapshot: {
            id: 'ac-1',
            name: 'Active Calories',
            category: 'Cardio',
            calories_per_hour: 0,
            source: 'system',
          },
        }),
      ];
      const stats = calculateExerciseStats(sessions);
      expect(stats.caloriesBurned).toBe(700);
      expect(stats.activeCalories).toBe(150);
      expect(stats.otherExerciseCalories).toBe(550);
      expect(stats.durationMinutes).toBe(90);
    });

    it('handles individual session with null duration_minutes', () => {
      const session = makeIndividual({
        calories_burned: 100,
        duration_minutes: null as any,
      });
      const stats = calculateExerciseStats([session]);
      expect(stats.durationMinutes).toBe(0);
    });

    it('handles individual session with null calories_burned', () => {
      const session = makeIndividual({
        calories_burned: null as any,
        duration_minutes: 30,
      });
      const stats = calculateExerciseStats([session]);
      expect(stats.caloriesBurned).toBe(0);
      expect(stats.otherExerciseCalories).toBe(0);
    });

    it('does not match partial "Active Calories" names', () => {
      const sessions = [
        makeIndividual({
          calories_burned: 200,
          duration_minutes: 20,
          exercise_snapshot: {
            id: 'ex-1',
            name: 'Active Calories Estimate',
            category: 'Cardio',
            calories_per_hour: 0,
            source: 'system',
          },
        }),
      ];
      const stats = calculateExerciseStats(sessions);
      // Should NOT be counted as activeCalories — name doesn't exactly match
      expect(stats.activeCalories).toBe(0);
      expect(stats.otherExerciseCalories).toBe(200);
      expect(stats.durationMinutes).toBe(20);
    });

    it('handles session with null exercise_snapshot (not Active Calories)', () => {
      const session = makeIndividual({
        calories_burned: 100,
        duration_minutes: 15,
        exercise_snapshot: null as any,
      });
      const stats = calculateExerciseStats([session]);
      expect(stats.activeCalories).toBe(0);
      expect(stats.otherExerciseCalories).toBe(100);
      expect(stats.durationMinutes).toBe(15);
    });

    it('handles Active Calories entry with null calories_burned', () => {
      const session = makeIndividual({
        calories_burned: null as any,
        duration_minutes: 0,
        exercise_snapshot: {
          id: 'ac-1',
          name: 'Active Calories',
          category: 'Cardio',
          calories_per_hour: 0,
          source: 'system',
        },
      });
      const stats = calculateExerciseStats([session]);
      expect(stats.activeCalories).toBe(0);
      expect(stats.caloriesBurned).toBe(0);
    });
  });

  describe('convenience wrappers', () => {
    const sessions: ExerciseSessionResponse[] = [
      makePreset({
        total_duration_minutes: 60,
        exercises: [
          { exercise_id: 'ex-1', calories_burned: 200, duration_minutes: 30, sets: [] } as any,
        ],
      }),
      makeIndividual({ calories_burned: 300, duration_minutes: 30 }),
      makeIndividual({
        calories_burned: 100,
        duration_minutes: 0,
        exercise_snapshot: {
          id: 'ac-1',
          name: 'Active Calories',
          category: 'Cardio',
          calories_per_hour: 0,
          source: 'system',
        },
      }),
    ];

    it('calculateCaloriesBurned returns total across all sessions', () => {
      expect(calculateCaloriesBurned(sessions)).toBe(600);
    });

    it('calculateActiveCalories returns only Active Calories entries', () => {
      expect(calculateActiveCalories(sessions)).toBe(100);
    });

    it('calculateOtherExerciseCalories excludes Active Calories', () => {
      expect(calculateOtherExerciseCalories(sessions)).toBe(500);
    });

    it('calculateExerciseDuration excludes Active Calories duration', () => {
      expect(calculateExerciseDuration(sessions)).toBe(90);
    });
  });

  describe('buildExercisesPayload', () => {
    const makeDraftExercise = (overrides?: Partial<WorkoutDraftExercise>): WorkoutDraftExercise => ({
      clientId: 'c1',
      exerciseId: 'ex-1',
      exerciseName: 'Bench Press',
      exerciseCategory: 'Strength',
      images: [],
      sets: [],
      ...overrides,
    });

    it('maps exercises with sort_order from array index', () => {
      const exercises = [
        makeDraftExercise({ exerciseId: 'ex-1' }),
        makeDraftExercise({ exerciseId: 'ex-2' }),
      ];
      const payload = buildExercisesPayload(exercises, 'kg');
      expect(payload[0].exercise_id).toBe('ex-1');
      expect(payload[0].sort_order).toBe(0);
      expect(payload[1].exercise_id).toBe('ex-2');
      expect(payload[1].sort_order).toBe(1);
    });

    it('sets duration_minutes to 0 for each exercise', () => {
      const payload = buildExercisesPayload([makeDraftExercise()], 'kg');
      expect(payload[0].duration_minutes).toBe(0);
    });

    it('maps sets with 1-based set_number', () => {
      const exercise = makeDraftExercise({
        sets: [
          { clientId: 's1', weight: '100', reps: '10' },
          { clientId: 's2', weight: '90', reps: '8' },
        ],
      });
      const payload = buildExercisesPayload([exercise], 'kg');
      expect(payload[0].sets[0].set_number).toBe(1);
      expect(payload[0].sets[1].set_number).toBe(2);
    });

    it('passes weight as-is in kg when unit is kg', () => {
      const exercise = makeDraftExercise({
        sets: [{ clientId: 's1', weight: '100', reps: '10' }],
      });
      const payload = buildExercisesPayload([exercise], 'kg');
      expect(payload[0].sets[0].weight).toBe(100);
      expect(payload[0].sets[0].reps).toBe(10);
    });

    it('converts weight from lbs to kg when unit is lbs', () => {
      const exercise = makeDraftExercise({
        sets: [{ clientId: 's1', weight: '225', reps: '5' }],
      });
      const payload = buildExercisesPayload([exercise], 'lbs');
      // 225 lbs * 0.45359237 ≈ 102.06
      expect(payload[0].sets[0].weight).toBeCloseTo(102.058, 1);
      expect(payload[0].sets[0].reps).toBe(5);
    });

    it('returns null for weight when value is not a number', () => {
      const exercise = makeDraftExercise({
        sets: [{ clientId: 's1', weight: '', reps: '10' }],
      });
      const payload = buildExercisesPayload([exercise], 'kg');
      expect(payload[0].sets[0].weight).toBeNull();
    });

    it('returns null for reps when value is not a number', () => {
      const exercise = makeDraftExercise({
        sets: [{ clientId: 's1', weight: '100', reps: '' }],
      });
      const payload = buildExercisesPayload([exercise], 'kg');
      expect(payload[0].sets[0].reps).toBeNull();
    });

    it('returns null for both when both are empty strings', () => {
      const exercise = makeDraftExercise({
        sets: [{ clientId: 's1', weight: '', reps: '' }],
      });
      const payload = buildExercisesPayload([exercise], 'kg');
      expect(payload[0].sets[0].weight).toBeNull();
      expect(payload[0].sets[0].reps).toBeNull();
    });

    it('returns null for non-numeric strings', () => {
      const exercise = makeDraftExercise({
        sets: [{ clientId: 's1', weight: 'abc', reps: 'xyz' }],
      });
      const payload = buildExercisesPayload([exercise], 'kg');
      expect(payload[0].sets[0].weight).toBeNull();
      expect(payload[0].sets[0].reps).toBeNull();
    });

    it('handles decimal weight strings', () => {
      const exercise = makeDraftExercise({
        sets: [{ clientId: 's1', weight: '62.5', reps: '8' }],
      });
      const payload = buildExercisesPayload([exercise], 'kg');
      expect(payload[0].sets[0].weight).toBe(62.5);
    });

    it('truncates decimal reps via parseInt', () => {
      const exercise = makeDraftExercise({
        sets: [{ clientId: 's1', weight: '100', reps: '8.7' }],
      });
      const payload = buildExercisesPayload([exercise], 'kg');
      expect(payload[0].sets[0].reps).toBe(8);
    });

    it('returns empty array for empty exercises', () => {
      expect(buildExercisesPayload([], 'kg')).toEqual([]);
    });

    it('handles exercise with empty sets array', () => {
      const exercise = makeDraftExercise({ sets: [] });
      const payload = buildExercisesPayload([exercise], 'kg');
      expect(payload[0].sets).toEqual([]);
    });

    describe('id + rest_time threading', () => {
      // Valid UUID v4 format (version nibble = 4, variant nibble = 8..b).
      const UUID_A = '11111111-1111-4111-8111-111111111111';
      const UUID_B = '22222222-2222-4222-8222-222222222222';

      it('omits id entirely when no exercise has serverId', () => {
        const payload = buildExercisesPayload(
          [
            makeDraftExercise({
              exerciseId: UUID_A,
              sets: [{ clientId: 's1', weight: '100', reps: '10' }],
            }),
          ],
          'kg',
        );
        expect(payload[0]).not.toHaveProperty('id');
        expect(payload[0].sets[0]).not.toHaveProperty('id');
        // Round-trip parse to confirm the shape is schema-valid.
        expect(() => presetSessionExerciseRequestSchema.parse(payload[0])).not.toThrow();
      });

      it('includes exercise id + per-set id when all exercises have serverId', () => {
        const payload = buildExercisesPayload(
          [
            makeDraftExercise({
              serverId: UUID_A,
              exerciseId: UUID_A,
              sets: [
                { clientId: 'c1', serverId: 101, weight: '100', reps: '10' },
                { clientId: 'c2', serverId: 102, weight: '90', reps: '8' },
              ],
            }),
            makeDraftExercise({
              serverId: UUID_B,
              exerciseId: UUID_B,
              sets: [{ clientId: 'c3', serverId: 201, weight: '50', reps: '12' }],
            }),
          ],
          'kg',
        );
        expect((payload[0] as any).id).toBe(UUID_A);
        expect((payload[0].sets[0] as any).id).toBe(101);
        expect((payload[0].sets[1] as any).id).toBe(102);
        expect((payload[1] as any).id).toBe(UUID_B);
        expect((payload[1].sets[0] as any).id).toBe(201);
        expect(() => presetSessionExerciseRequestSchema.parse(payload[0])).not.toThrow();
        expect(() => presetSessionExerciseRequestSchema.parse(payload[1])).not.toThrow();
      });

      it('includes rest_time when restTime is set', () => {
        const payload = buildExercisesPayload(
          [
            makeDraftExercise({
              serverId: UUID_A,
              exerciseId: UUID_A,
              sets: [
                {
                  clientId: 'c1',
                  serverId: 101,
                  restTime: 120,
                  weight: '100',
                  reps: '10',
                },
              ],
            }),
          ],
          'kg',
        );
        expect((payload[0].sets[0] as any).rest_time).toBe(120);
      });

      it('omits rest_time when restTime is null', () => {
        const payload = buildExercisesPayload(
          [
            makeDraftExercise({
              serverId: UUID_A,
              exerciseId: UUID_A,
              sets: [
                {
                  clientId: 'c1',
                  serverId: 101,
                  restTime: null,
                  weight: '100',
                  reps: '10',
                },
              ],
            }),
          ],
          'kg',
        );
        expect(payload[0].sets[0]).not.toHaveProperty('rest_time');
      });

      it('strips all exercise and set IDs when any exercise lacks serverId (mixed fallback)', () => {
        const payload = buildExercisesPayload(
          [
            makeDraftExercise({
              serverId: UUID_A,
              exerciseId: UUID_A,
              sets: [{ clientId: 'c1', serverId: 101, weight: '100', reps: '10' }],
            }),
            // New exercise without serverId — should force the fallback.
            makeDraftExercise({
              exerciseId: UUID_B,
              sets: [{ clientId: 'c2', weight: '80', reps: '8' }],
            }),
          ],
          'kg',
        );
        expect(payload[0]).not.toHaveProperty('id');
        expect(payload[0].sets[0]).not.toHaveProperty('id');
        expect(payload[1]).not.toHaveProperty('id');
        expect(payload[1].sets[0]).not.toHaveProperty('id');
        expect(() => presetSessionExerciseRequestSchema.parse(payload[0])).not.toThrow();
        expect(() => presetSessionExerciseRequestSchema.parse(payload[1])).not.toThrow();
      });
    });
  });

  describe('buildPresetExercisesPayload', () => {
    const makeDraftExercise = (overrides?: Partial<WorkoutDraftExercise>): WorkoutDraftExercise => ({
      clientId: 'c1',
      exerciseId: 'ex-1',
      exerciseName: 'Bench Press',
      exerciseCategory: 'Strength',
      images: [],
      sets: [],
      ...overrides,
    });

    it('returns empty array for no exercises', () => {
      expect(buildPresetExercisesPayload([], 'kg')).toEqual([]);
    });

    it('preserves exercises with zero sets so saving an unrelated edit does not delete them', () => {
      const payload = buildPresetExercisesPayload(
        [
          makeDraftExercise({ exerciseId: 'ex-1', sets: [] }),
          makeDraftExercise({
            exerciseId: 'ex-2',
            sets: [{ clientId: 's1', weight: '50', reps: '10' }],
          }),
        ],
        'kg',
      );
      expect(payload).toHaveLength(2);
      expect(payload[0].exercise_id).toBe('ex-1');
      expect(payload[0].sort_order).toBe(0);
      expect(payload[0].sets).toEqual([]);
      expect(payload[1].exercise_id).toBe('ex-2');
      expect(payload[1].sort_order).toBe(1);
    });

    it('preserves a weight of 0 (not collapsed to null)', () => {
      const payload = buildPresetExercisesPayload(
        [
          makeDraftExercise({
            sets: [{ clientId: 's1', weight: '0', reps: '10' }],
          }),
        ],
        'kg',
      );
      expect(payload[0].sets[0].weight).toBe(0);
      expect(payload[0].sets[0].reps).toBe(10);
    });

    it('preserves reps of 0 (not collapsed to null)', () => {
      const payload = buildPresetExercisesPayload(
        [
          makeDraftExercise({
            sets: [{ clientId: 's1', weight: '50', reps: '0' }],
          }),
        ],
        'kg',
      );
      expect(payload[0].sets[0].reps).toBe(0);
    });

    it('returns null for non-numeric reps and weight', () => {
      const payload = buildPresetExercisesPayload(
        [
          makeDraftExercise({
            sets: [{ clientId: 's1', weight: '', reps: '' }],
          }),
        ],
        'kg',
      );
      expect(payload[0].sets[0].weight).toBeNull();
      expect(payload[0].sets[0].reps).toBeNull();
    });

    it('converts weight from lbs to kg when unit is lbs', () => {
      const payload = buildPresetExercisesPayload(
        [
          makeDraftExercise({
            sets: [{ clientId: 's1', weight: '225', reps: '5' }],
          }),
        ],
        'lbs',
      );
      expect(payload[0].sets[0].weight).toBeCloseTo(102.058, 1);
    });

    it('defaults set_type to "normal" when not provided', () => {
      const payload = buildPresetExercisesPayload(
        [
          makeDraftExercise({
            sets: [{ clientId: 's1', weight: '50', reps: '10' }],
          }),
        ],
        'kg',
      );
      expect(payload[0].sets[0].set_type).toBe('normal');
    });

    it('round-trips set_type, duration, and notes from the draft', () => {
      const payload = buildPresetExercisesPayload(
        [
          makeDraftExercise({
            sets: [
              {
                clientId: 's1',
                weight: '50',
                reps: '10',
                setType: 'warmup',
                duration: 45,
                notes: 'easy set',
              },
            ],
          }),
        ],
        'kg',
      );
      expect(payload[0].sets[0].set_type).toBe('warmup');
      expect(payload[0].sets[0].duration).toBe(45);
      expect(payload[0].sets[0].notes).toBe('easy set');
    });

    it('defaults duration and notes to null when not provided', () => {
      const payload = buildPresetExercisesPayload(
        [
          makeDraftExercise({
            sets: [{ clientId: 's1', weight: '50', reps: '10' }],
          }),
        ],
        'kg',
      );
      expect(payload[0].sets[0].duration).toBeNull();
      expect(payload[0].sets[0].notes).toBeNull();
    });

    it('uses set restTime, defaulting null when undefined', () => {
      const payload = buildPresetExercisesPayload(
        [
          makeDraftExercise({
            sets: [
              { clientId: 's1', weight: '50', reps: '10', restTime: 120 },
              { clientId: 's2', weight: '50', reps: '8' },
            ],
          }),
        ],
        'kg',
      );
      expect(payload[0].sets[0].rest_time).toBe(120);
      expect(payload[0].sets[1].rest_time).toBeNull();
    });

    it('takes the first image as image_url', () => {
      const payload = buildPresetExercisesPayload(
        [
          makeDraftExercise({
            images: ['first.jpg', 'second.jpg'],
            sets: [{ clientId: 's1', weight: '50', reps: '10' }],
          }),
        ],
        'kg',
      );
      expect(payload[0].image_url).toBe('first.jpg');
    });

    it('emits null image_url when no images', () => {
      const payload = buildPresetExercisesPayload(
        [
          makeDraftExercise({
            images: [],
            sets: [{ clientId: 's1', weight: '50', reps: '10' }],
          }),
        ],
        'kg',
      );
      expect(payload[0].image_url).toBeNull();
    });

    it('assigns 1-based set_number and 0-based sort_order', () => {
      const payload = buildPresetExercisesPayload(
        [
          makeDraftExercise({
            exerciseId: 'ex-1',
            sets: [
              { clientId: 's1', weight: '50', reps: '10' },
              { clientId: 's2', weight: '50', reps: '8' },
            ],
          }),
          makeDraftExercise({
            exerciseId: 'ex-2',
            sets: [{ clientId: 's3', weight: '70', reps: '5' }],
          }),
        ],
        'kg',
      );
      expect(payload[0].sort_order).toBe(0);
      expect(payload[0].sets[0].set_number).toBe(1);
      expect(payload[0].sets[1].set_number).toBe(2);
      expect(payload[1].sort_order).toBe(1);
      expect(payload[1].sets[0].set_number).toBe(1);
    });
  });
});
