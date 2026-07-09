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
  buildPresetStartExercisesPayload,
  buildSessionExercisesPayload,
  buildSingleExerciseStartPayload,
  draftExerciseToCardExercise,
  presetExerciseToCardExercise,
  DEFAULT_REST_SEC,
  isTempExerciseEntryId,
  isTempSetId,
  epley1RmKg,
  estimateRepMaxKg,
  setVolumeKg,
  getExerciseVolumeKg,
  formatVolume,
  getRpeTone,
  getSupersetRuns,
  buildSupersetColorMap,
  buildExerciseReorderItems,
  moveSessionExerciseItem,
  moveDraftExerciseItem,
  isWarmupSetType,
  seedPrFromSession,
  compareSetRecords,
  makeSparseExercise,
  exerciseFromDraft,
} from '../../src/utils/workoutSession';
import type {
  ExerciseEntryResponse,
  ExerciseSessionResponse,
  ExerciseSnapshotResponse,
} from '@workspace/shared';
import { presetSessionExerciseRequestSchema } from '@workspace/shared';
import { weightFromKg } from '../../src/utils/unitConversions';
import type { WorkoutDraftExercise } from '../../src/types/drafts';
import type {
  WorkoutPreset,
  WorkoutPresetExercise,
  WorkoutPresetSet,
} from '../../src/types/workoutPresets';

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
  superset_group: null,
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

    it('round-trips supersetGroup opaquely and defaults missing values to null', () => {
      const payload = buildExercisesPayload(
        [
          makeDraftExercise({ supersetGroup: 2 }),
          makeDraftExercise({ supersetGroup: null }),
          makeDraftExercise(),
        ],
        'kg',
      );
      expect(payload[0].superset_group).toBe(2);
      expect(payload[1].superset_group).toBeNull();
      expect(payload[2].superset_group).toBeNull();
    });

    it('round-trips completedAt opaquely and emits null for sets without it', () => {
      const completedAt = '2026-03-20T10:30:00.000Z';
      const payload = buildExercisesPayload(
        [
          makeDraftExercise({
            sets: [
              { clientId: 's1', weight: '100', reps: '10', completedAt },
              { clientId: 's2', weight: '90', reps: '8' },
            ],
          }),
        ],
        'kg',
      );
      expect(payload[0].sets[0].completed_at).toBe(completedAt);
      // A new form set has no completion — the server stores null.
      expect(payload[0].sets[1].completed_at).toBeNull();
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

    describe('round-trip columns (server nulls omitted fields)', () => {
      it('emits set_type, duration, notes, and rpe explicitly as null when absent', () => {
        const payload = buildExercisesPayload(
          [
            makeDraftExercise({
              sets: [{ clientId: 's1', weight: '100', reps: '10' }],
            }),
          ],
          'kg',
        );
        expect(payload[0].sets[0].set_type).toBeNull();
        expect(payload[0].sets[0].duration).toBeNull();
        expect(payload[0].sets[0].notes).toBeNull();
        expect(payload[0].sets[0].rpe).toBeNull();
      });

      it('round-trips set_type, duration, notes, and rpe from the draft', () => {
        const payload = buildExercisesPayload(
          [
            makeDraftExercise({
              sets: [
                {
                  clientId: 's1',
                  weight: '100',
                  reps: '10',
                  setType: 'warmup',
                  duration: 45,
                  notes: 'easy',
                  rpe: 7.5,
                },
              ],
            }),
          ],
          'kg',
        );
        expect(payload[0].sets[0].set_type).toBe('warmup');
        expect(payload[0].sets[0].duration).toBe(45);
        expect(payload[0].sets[0].notes).toBe('easy');
        expect(payload[0].sets[0].rpe).toBe(7.5);
      });

      it('round-trips is_pr from the draft, defaulting to false when absent', () => {
        const payload = buildExercisesPayload(
          [
            makeDraftExercise({
              sets: [
                { clientId: 's1', weight: '100', reps: '10', isPr: true },
                { clientId: 's2', weight: '90', reps: '8' },
              ],
            }),
          ],
          'kg',
        );
        expect(payload[0].sets[0].is_pr).toBe(true);
        expect(payload[0].sets[1].is_pr).toBe(false);
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

    it('emits superset_group from the draft, defaulting to null', () => {
      const payload = buildPresetExercisesPayload(
        [
          makeDraftExercise({ exerciseId: 'ex-1', supersetGroup: 2 }),
          makeDraftExercise({ exerciseId: 'ex-2' }),
        ],
        'kg',
      );
      expect(payload[0].superset_group).toBe(2);
      expect(payload[1].superset_group).toBeNull();
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

  describe('card adapters', () => {
    describe('draftExerciseToCardExercise', () => {
      const makeDraftExercise = (
        overrides?: Partial<WorkoutDraftExercise>,
      ): WorkoutDraftExercise => ({
        clientId: 'c1',
        exerciseId: 'ex-1',
        exerciseName: 'Bench Press',
        exerciseCategory: 'Strength',
        images: ['bench.png'],
        sets: [{ clientId: 's1', weight: '100', reps: '5', restTime: 90 }],
        ...overrides,
      });

      it('maps client ids, snapshot fallback, and superset group', () => {
        const card = draftExerciseToCardExercise(
          makeDraftExercise({ supersetGroup: 2 }),
          'kg',
        );
        expect(card.id).toBe('c1');
        expect(card.exercise_id).toBe('ex-1');
        expect(card.superset_group).toBe(2);
        expect(card.exercise_snapshot).toEqual({
          name: 'Bench Press',
          category: 'Strength',
          images: ['bench.png'],
        });
        expect(card.sets[0]).toMatchObject({
          id: 's1',
          set_number: 1,
          weight: 100,
          reps: 5,
          rest_time: 90,
          editWeightText: '100',
          editRepsText: '5',
        });
      });

      it('prefers the server snapshot when editing an existing session', () => {
        const snapshot = { id: 'ex-1', name: 'Snap Name', category: 'Snap', images: [] };
        const card = draftExerciseToCardExercise(
          makeDraftExercise({ snapshot: snapshot as never }),
          'kg',
        );
        expect(card.exercise_snapshot).toBe(snapshot);
      });

      it('maps empty draft strings to null weight/reps', () => {
        const card = draftExerciseToCardExercise(
          makeDraftExercise({ sets: [{ clientId: 's1', weight: '', reps: '' }] }),
          'kg',
        );
        expect(card.sets[0].weight).toBeNull();
        expect(card.sets[0].reps).toBeNull();
      });

      it('pins the lbs precision path: "100" lbs round-trips to display "100"', () => {
        const card = draftExerciseToCardExercise(makeDraftExercise(), 'lbs');
        expect(card.sets[0].weight).toBeCloseTo(45.359, 3);
        // The row's display formatting for the mapped kg value.
        const display = String(
          parseFloat(weightFromKg(card.sets[0].weight!, 'lbs').toFixed(1)),
        );
        expect(display).toBe('100');
        // The raw draft string survives untouched for the controlled inputs.
        expect(card.sets[0].editWeightText).toBe('100');
      });

      it('carries setType, rpe, and duration', () => {
        const card = draftExerciseToCardExercise(
          makeDraftExercise({
            sets: [
              {
                clientId: 's1',
                weight: '40',
                reps: '12',
                setType: 'warmup',
                rpe: 8.5,
                duration: 45,
              },
            ],
          }),
          'kg',
        );
        expect(card.sets[0].set_type).toBe('warmup');
        expect(card.sets[0].rpe).toBe(8.5);
        expect(card.sets[0].duration).toBe(45);
      });
    });

    describe('presetExerciseToCardExercise', () => {
      const presetExercise = (
        overrides?: Partial<WorkoutPresetExercise>,
      ): WorkoutPresetExercise => ({
        id: 801,
        exercise_id: 'ex-1',
        image_url: 'img.png',
        exercise_name: 'Squat',
        category: 'legs',
        superset_group: 3,
        sets: [
          {
            id: 901,
            set_number: 4,
            set_type: 'warmup',
            reps: 5,
            weight: 100,
            duration: 60,
            rest_time: 120,
            notes: null,
          },
        ],
        ...overrides,
      });

      it('maps preset fields with kg passthrough and stringified ids', () => {
        const card = presetExerciseToCardExercise(presetExercise());
        expect(card.id).toBe('801');
        expect(card.superset_group).toBe(3);
        expect(card.exercise_snapshot).toEqual({
          name: 'Squat',
          category: 'legs',
          images: ['img.png'],
        });
        expect(card.sets[0]).toEqual({
          id: 901,
          set_number: 1,
          set_type: 'warmup',
          weight: 100,
          reps: 5,
          rpe: null,
          rest_time: 120,
          duration: 60,
        });
      });

      it('defaults null image and superset group', () => {
        const card = presetExerciseToCardExercise(
          presetExercise({ image_url: null, superset_group: null }),
        );
        expect(card.exercise_snapshot?.images).toEqual([]);
        expect(card.superset_group).toBeNull();
      });
    });
  });

  describe('buildSessionExercisesPayload', () => {
    const ENTRY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const ENTRY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const EX_1 = '11111111-1111-4111-8111-111111111111';
    const EX_2 = '22222222-2222-4222-8222-222222222222';

    type SessionExercise = PresetSession['exercises'][number];
    type SessionSet = SessionExercise['sets'][number];

    const makeSet = (overrides?: Partial<SessionSet>): SessionSet => ({
      id: 101,
      set_number: 1,
      set_type: 'normal',
      reps: 10,
      weight: 60,
      duration: null,
      rest_time: 90,
      notes: null,
      rpe: 8,
      completed_at: null,
      ...overrides,
    });

    const makeExercise = (overrides?: Partial<SessionExercise>): SessionExercise => ({
      id: ENTRY_A,
      exercise_id: EX_1,
      duration_minutes: 20,
      calories_burned: 150,
      entry_date: '2026-03-20',
      notes: null,
      distance: null,
      avg_heart_rate: null,
      source: null,
      superset_group: null,
      exercise_snapshot: null,
      activity_details: [],
      sets: [makeSet()],
      ...overrides,
    });

    /** No `temp-` exercise id and no negative set id may ever reach the server. */
    function expectNoTempIds(payload: ReturnType<typeof buildSessionExercisesPayload>) {
      for (const exercise of payload) {
        if ('id' in exercise && exercise.id != null) {
          expect(isTempExerciseEntryId(String(exercise.id))).toBe(false);
        }
        for (const set of exercise.sets) {
          if ('id' in set && typeof set.id === 'number') {
            expect(isTempSetId(set.id)).toBe(false);
          }
        }
      }
    }

    it('reconcile path: keeps exercise + set ids and emits every set column explicitly', () => {
      const session = makePreset({
        exercises: [
          makeExercise({
            sets: [
              makeSet({ id: 101, set_type: 'warmup', weight: 40, reps: 12, rpe: null }),
              makeSet({ id: 102, set_number: 2, weight: 60, notes: 'felt heavy', rpe: 9 }),
            ],
          }),
        ],
      });

      const payload = buildSessionExercisesPayload(session, {}, {});
      expect(payload[0].id).toBe(ENTRY_A);
      expect(payload[0].exercise_id).toBe(EX_1);
      expect(payload[0].sets[0]).toEqual({
        id: 101,
        set_number: 1,
        set_type: 'warmup',
        reps: 12,
        weight: 40,
        duration: null,
        rest_time: 90,
        notes: null,
        rpe: null,
        completed_at: null,
        is_pr: false,
      });
      expect(payload[0].sets[1]).toEqual({
        id: 102,
        set_number: 2,
        set_type: 'normal',
        reps: 10,
        weight: 60,
        duration: null,
        rest_time: 90,
        notes: 'felt heavy',
        rpe: 9,
        completed_at: null,
        is_pr: false,
      });
      expect(() => presetSessionExerciseRequestSchema.parse(payload[0])).not.toThrow();
      expectNoTempIds(payload);
    });

    it('reconcile path: omits negative temp set ids so the server inserts them', () => {
      const session = makePreset({
        exercises: [
          makeExercise({
            sets: [makeSet({ id: 101 }), makeSet({ id: -2, set_number: 2 })],
          }),
        ],
      });

      const payload = buildSessionExercisesPayload(session, {}, {});
      expect(payload[0].id).toBe(ENTRY_A);
      expect((payload[0].sets[0] as any).id).toBe(101);
      expect(payload[0].sets[1]).not.toHaveProperty('id');
      expect(payload[0].sets[1].set_number).toBe(2);
      expect(() => presetSessionExerciseRequestSchema.parse(payload[0])).not.toThrow();
      expectNoTempIds(payload);
    });

    it('recreate path: a temp exercise id strips ALL exercise and set ids', () => {
      const session = makePreset({
        exercises: [
          makeExercise({ id: ENTRY_A, sets: [makeSet({ id: 101 })] }),
          makeExercise({
            id: 'temp-abc123',
            exercise_id: EX_2,
            sets: [makeSet({ id: -1 })],
          }),
        ],
      });

      const payload = buildSessionExercisesPayload(session, {}, {});
      expect(payload[0]).not.toHaveProperty('id');
      expect(payload[0].sets[0]).not.toHaveProperty('id');
      expect(payload[1]).not.toHaveProperty('id');
      expect(payload[1].sets[0]).not.toHaveProperty('id');
      expect(() => presetSessionExerciseRequestSchema.parse(payload[0])).not.toThrow();
      expect(() => presetSessionExerciseRequestSchema.parse(payload[1])).not.toThrow();
      expectNoTempIds(payload);
    });

    it('passes weight through in kg without conversion', () => {
      const session = makePreset({
        exercises: [makeExercise({ sets: [makeSet({ weight: 102.5 })] })],
      });
      expect(buildSessionExercisesPayload(session, {}, {})[0].sets[0].weight).toBe(102.5);
    });

    it('assigns positional set_number and sort_order regardless of stored values', () => {
      const session = makePreset({
        exercises: [
          makeExercise({
            id: ENTRY_B,
            exercise_id: EX_2,
            sets: [makeSet({ id: 201, set_number: 7 }), makeSet({ id: 202, set_number: 3 })],
          }),
          makeExercise({ id: ENTRY_A, exercise_id: EX_1 }),
        ],
      });

      const payload = buildSessionExercisesPayload(session, {}, {});
      expect(payload[0].sort_order).toBe(0);
      expect(payload[1].sort_order).toBe(1);
      expect(payload[0].sets[0].set_number).toBe(1);
      expect(payload[0].sets[1].set_number).toBe(2);
    });

    it('round-trips exercise-level notes and duration_minutes', () => {
      const session = makePreset({
        exercises: [makeExercise({ notes: 'superset next time', duration_minutes: 25 })],
      });
      const payload = buildSessionExercisesPayload(session, {}, {});
      expect(payload[0].notes).toBe('superset next time');
      expect(payload[0].duration_minutes).toBe(25);
    });

    describe('wall-clock duration stamping', () => {
      const startedAt = Date.UTC(2026, 2, 20, 10, 0, 0);
      const min = (n: number) => startedAt + n * 60_000;

      it('splits start→last-completion across exercises by completed-set count', () => {
        const session = makePreset({
          exercises: [
            makeExercise({
              sets: [makeSet({ id: 101 }), makeSet({ id: 102, set_number: 2 })],
            }),
            makeExercise({
              id: ENTRY_B,
              exercise_id: EX_2,
              sets: [makeSet({ id: 201 }), makeSet({ id: 202, set_number: 2 })],
            }),
          ],
        });

        // Three of four sets completed; the last one 30 min in.
        const completed = { '101': min(5), '102': min(12), '201': min(30) };
        const payload = buildSessionExercisesPayload(session, completed, {}, startedAt);
        expect(payload[0].duration_minutes).toBe(20); // 30 × 2/3
        expect(payload[1].duration_minutes).toBe(10); // 30 × 1/3
      });

      it('gives an exercise with no completed sets zero duration', () => {
        const session = makePreset({
          exercises: [
            makeExercise({ sets: [makeSet({ id: 101 })] }),
            makeExercise({ id: ENTRY_B, exercise_id: EX_2, sets: [makeSet({ id: 201 })] }),
          ],
        });
        const payload = buildSessionExercisesPayload(session, { '101': min(10) }, {}, startedAt);
        expect(payload[0].duration_minutes).toBe(10);
        expect(payload[1].duration_minutes).toBe(0);
      });

      it('round-trips existing durations when nothing is completed', () => {
        const session = makePreset({
          exercises: [makeExercise({ duration_minutes: 25 })],
        });
        const payload = buildSessionExercisesPayload(session, {}, {}, startedAt);
        expect(payload[0].duration_minutes).toBe(25);
      });

      it('round-trips existing durations when the only completions predate the start (resumed session)', () => {
        const session = makePreset({
          exercises: [makeExercise({ duration_minutes: 25, sets: [makeSet({ id: 101 })] })],
        });
        const payload = buildSessionExercisesPayload(
          session,
          { '101': startedAt - 60_000 },
          {},
          startedAt,
        );
        expect(payload[0].duration_minutes).toBe(25);
      });

      it('round-trips existing durations when startedAt is not provided', () => {
        const session = makePreset({
          exercises: [makeExercise({ duration_minutes: 25, sets: [makeSet({ id: 101 })] })],
        });
        const payload = buildSessionExercisesPayload(session, { '101': min(10) }, {});
        expect(payload[0].duration_minutes).toBe(25);
      });
    });

    it('emits explicit nulls for absent exercise notes', () => {
      const session = makePreset({ exercises: [makeExercise({ notes: null })] });
      expect(buildSessionExercisesPayload(session, {}, {})[0].notes).toBeNull();
    });

    it('round-trips superset_group and normalizes undefined to null', () => {
      const session = makePreset({
        exercises: [
          makeExercise({ superset_group: 1 }),
          makeExercise({ id: ENTRY_B, exercise_id: EX_2, superset_group: null }),
          // Sessions persisted before the superset upgrade lack the field
          // entirely — the type can't express this, but the builder must
          // still emit an explicit null so the server doesn't reject it.
          makeExercise({ superset_group: undefined as unknown as null }),
        ],
      });

      const payload = buildSessionExercisesPayload(session, {}, {});
      expect(payload[0].superset_group).toBe(1);
      expect(payload[1].superset_group).toBeNull();
      expect(payload[2].superset_group).toBeNull();
      expect(() => presetSessionExerciseRequestSchema.parse(payload[0])).not.toThrow();
    });

    it('emits completed_at from the completion map: ISO for mapped ids, null otherwise', () => {
      const completedMs = Date.UTC(2026, 2, 20, 10, 30, 0, 123);
      const session = makePreset({
        exercises: [
          makeExercise({
            sets: [makeSet({ id: 101 }), makeSet({ id: 102, set_number: 2 })],
          }),
        ],
      });

      const payload = buildSessionExercisesPayload(session, { '101': completedMs }, {});
      expect(payload[0].sets[0].completed_at).toBe(new Date(completedMs).toISOString());
      // Unmapped sets send an explicit null so unchecking propagates as a clear.
      expect(payload[0].sets[1].completed_at).toBeNull();
      expect(() => presetSessionExerciseRequestSchema.parse(payload[0])).not.toThrow();
    });

    it('keeps completed_at on id-less sets in the recreate path', () => {
      const completedMs = Date.UTC(2026, 2, 20, 10, 30, 0);
      const session = makePreset({
        exercises: [
          makeExercise({ id: ENTRY_A, sets: [makeSet({ id: 101 })] }),
          makeExercise({
            id: 'temp-abc123',
            exercise_id: EX_2,
            sets: [makeSet({ id: -1 })],
          }),
        ],
      });

      const payload = buildSessionExercisesPayload(
        session,
        {
          '101': completedMs,
          '-1': completedMs,
        },
        {},
      );
      // Ids are stripped (delete-and-recreate), but completion travels in the rows.
      expect(payload[0].sets[0]).not.toHaveProperty('id');
      expect(payload[0].sets[0].completed_at).toBe(new Date(completedMs).toISOString());
      expect(payload[1].sets[0]).not.toHaveProperty('id');
      expect(payload[1].sets[0].completed_at).toBe(new Date(completedMs).toISOString());
    });

    it('emits is_pr from the stamp map: true for stamped ids, false otherwise', () => {
      const session = makePreset({
        exercises: [
          makeExercise({
            sets: [makeSet({ id: 101 }), makeSet({ id: 102, set_number: 2 })],
          }),
        ],
      });

      const payload = buildSessionExercisesPayload(session, {}, { '101': true });
      expect(payload[0].sets[0].is_pr).toBe(true);
      // Unstamped sets send an explicit false so unchecking a PR clears it.
      expect(payload[0].sets[1].is_pr).toBe(false);
      expect(() => presetSessionExerciseRequestSchema.parse(payload[0])).not.toThrow();
    });

    it('carries is_pr on id-less sets in the recreate path', () => {
      const session = makePreset({
        exercises: [
          makeExercise({ id: ENTRY_A, sets: [makeSet({ id: 101 })] }),
          makeExercise({
            id: 'temp-abc123',
            exercise_id: EX_2,
            sets: [makeSet({ id: -1 })],
          }),
        ],
      });

      const payload = buildSessionExercisesPayload(session, {}, { '101': true, '-1': true });
      expect(payload[0].sets[0]).not.toHaveProperty('id');
      expect(payload[0].sets[0].is_pr).toBe(true);
      expect(payload[1].sets[0]).not.toHaveProperty('id');
      expect(payload[1].sets[0].is_pr).toBe(true);
    });
  });

  describe('isWarmupSetType', () => {
    it('matches every repo warmup variant after normalization', () => {
      for (const variant of [
        'warmup',
        'Warmup',
        'Warm-up',
        'Warm up',
        'Warm-up Set',
        'WARMUP',
      ]) {
        expect(isWarmupSetType(variant)).toBe(true);
      }
    });

    it('treats working set types and null as non-warmup', () => {
      for (const variant of ['normal', 'Working Set', 'drop', 'failure']) {
        expect(isWarmupSetType(variant)).toBe(false);
      }
      expect(isWarmupSetType(null)).toBe(false);
      expect(isWarmupSetType(undefined)).toBe(false);
    });
  });

  describe('compareSetRecords', () => {
    it('orders by weight at hundredths precision, then reps', () => {
      expect(compareSetRecords({ weight: 100, reps: 5 }, { weight: 90, reps: 8 })).toBeGreaterThan(0);
      expect(compareSetRecords({ weight: 90, reps: 8 }, { weight: 100, reps: 5 })).toBeLessThan(0);
      // Equal weight → reps break the tie (null reps count as 0).
      expect(compareSetRecords({ weight: 100, reps: 6 }, { weight: 100, reps: 5 })).toBeGreaterThan(0);
      expect(compareSetRecords({ weight: 100, reps: null }, { weight: 100, reps: 0 })).toBe(0);
    });

    it('rounds sub-cent differences to equality (numeric(10,2) round-trip)', () => {
      // 100 vs 100.004 → both round to 10000 hundredths → tie on weight.
      expect(compareSetRecords({ weight: 100, reps: 5 }, { weight: 100.004, reps: 5 })).toBe(0);
    });
  });

  describe('seedPrFromSession', () => {
    it('stamps only sets whose is_pr is true', () => {
      const session = {
        ...makePreset(),
        exercises: [
          {
            sets: [
              { id: 101, is_pr: true },
              { id: 102, is_pr: false },
              { id: 103 },
            ],
          },
        ],
      } as unknown as PresetSession;

      expect(seedPrFromSession(session)).toEqual({ '101': true });
    });
  });

  describe('live-start payload builders', () => {
    // exercise_id is uuid-validated by presetSessionExerciseRequestSchema.
    const EX_A = '11111111-1111-4111-8111-111111111111';
    const EX_B = '22222222-2222-4222-8222-222222222222';

    const makePresetSet = (overrides?: Partial<WorkoutPresetSet>): WorkoutPresetSet => ({
      id: 901,
      set_number: 1,
      set_type: 'normal',
      reps: 8,
      weight: 100,
      duration: null,
      rest_time: 120,
      notes: null,
      ...overrides,
    });

    const makePresetExercise = (
      overrides?: Partial<WorkoutPresetExercise>,
    ): WorkoutPresetExercise => ({
      id: 801,
      exercise_id: EX_A,
      image_url: null,
      exercise_name: 'Bench Press',
      category: 'Strength',
      superset_group: null,
      sets: [makePresetSet()],
      ...overrides,
    });

    const makeWorkoutPreset = (overrides?: Partial<WorkoutPreset>): WorkoutPreset => ({
      id: 5,
      user_id: 'user-1',
      name: 'Push Day',
      description: null,
      is_public: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      exercises: [makePresetExercise()],
      ...overrides,
    });

    describe('buildPresetStartExercisesPayload', () => {
      it('maps preset exercises and sets field-for-field with kg passthrough', () => {
        const preset = makeWorkoutPreset({
          exercises: [
            makePresetExercise({
              sets: [
                makePresetSet({
                  set_type: 'warmup',
                  reps: 12,
                  weight: 60,
                  duration: 45,
                  rest_time: 60,
                  notes: 'slow tempo',
                }),
              ],
            }),
          ],
        });

        const payload = buildPresetStartExercisesPayload(preset);

        expect(payload).toEqual([
          {
            exercise_id: EX_A,
            sort_order: 0,
            duration_minutes: 0,
            notes: null,
            superset_group: null,
            sets: [
              {
                set_number: 1,
                set_type: 'warmup',
                reps: 12,
                weight: 60,
                duration: 45,
                rest_time: 60,
                notes: 'slow tempo',
                rpe: null,
                completed_at: null,
              },
            ],
          },
        ]);
      });

      it('threads superset_group from the preset into the live-start payload', () => {
        const preset = makeWorkoutPreset({
          exercises: [
            makePresetExercise({ superset_group: 1 }),
            makePresetExercise({ id: 802, exercise_id: EX_B, superset_group: 1 }),
            makePresetExercise({ id: 803, exercise_id: EX_A, superset_group: null }),
          ],
        });

        const payload = buildPresetStartExercisesPayload(preset);

        expect(payload.map(e => e.superset_group)).toEqual([1, 1, null]);
      });

      it('indexes sort_order and renumbers sets sequentially', () => {
        const preset = makeWorkoutPreset({
          exercises: [
            makePresetExercise({
              sets: [
                makePresetSet({ set_number: 3 }),
                makePresetSet({ id: 902, set_number: 7 }),
              ],
            }),
            makePresetExercise({ id: 802, exercise_id: EX_B }),
          ],
        });

        const payload = buildPresetStartExercisesPayload(preset);

        expect(payload.map(e => e.sort_order)).toEqual([0, 1]);
        expect(payload[0].sets.map(s => s.set_number)).toEqual([1, 2]);
      });

      it('never emits exercise or set ids', () => {
        const payload = buildPresetStartExercisesPayload(makeWorkoutPreset());
        expect(payload[0]).not.toHaveProperty('id');
        expect(payload[0].sets[0]).not.toHaveProperty('id');
      });

      it('injects one default set for a zero-set preset exercise', () => {
        const preset = makeWorkoutPreset({
          exercises: [makePresetExercise({ sets: [] })],
        });

        const payload = buildPresetStartExercisesPayload(preset);

        expect(payload[0].sets).toEqual([
          {
            set_number: 1,
            set_type: 'normal',
            reps: null,
            weight: null,
            duration: null,
            rest_time: DEFAULT_REST_SEC,
            notes: null,
            rpe: null,
            completed_at: null,
          },
        ]);
      });

      it('returns [] for a preset with no exercises', () => {
        expect(buildPresetStartExercisesPayload(makeWorkoutPreset({ exercises: [] }))).toEqual([]);
      });

      it('emits exercises that parse under the request schema', () => {
        const preset = makeWorkoutPreset({
          exercises: [
            makePresetExercise({ sets: [makePresetSet({ reps: null, weight: null })] }),
            makePresetExercise({ id: 802, exercise_id: EX_B, sets: [] }),
          ],
        });

        for (const exercise of buildPresetStartExercisesPayload(preset)) {
          expect(() => presetSessionExerciseRequestSchema.parse(exercise)).not.toThrow();
        }
      });
    });

    describe('buildSingleExerciseStartPayload', () => {
      it('builds one exercise with one default set', () => {
        expect(buildSingleExerciseStartPayload({ id: EX_A })).toEqual([
          {
            exercise_id: EX_A,
            sort_order: 0,
            duration_minutes: 0,
            notes: null,
            sets: [
              {
                set_number: 1,
                set_type: 'normal',
                reps: null,
                weight: null,
                duration: null,
                rest_time: DEFAULT_REST_SEC,
                notes: null,
                rpe: null,
                completed_at: null,
              },
            ],
          },
        ]);
      });

      it('parses under the request schema', () => {
        const [exercise] = buildSingleExerciseStartPayload({ id: EX_A });
        expect(() => presetSessionExerciseRequestSchema.parse(exercise)).not.toThrow();
      });
    });
  });

  describe('set metrics', () => {
    describe('epley1RmKg', () => {
      it('returns the weight itself for a single rep', () => {
        expect(epley1RmKg(100, 1)).toBe(100);
      });

      it('applies the Epley formula for multiple reps', () => {
        expect(epley1RmKg(100, 5)).toBeCloseTo(116.667, 2);
        expect(epley1RmKg(60, 10)).toBeCloseTo(80, 5);
      });

      it('returns 0 for missing or non-positive inputs', () => {
        expect(epley1RmKg(null, 5)).toBe(0);
        expect(epley1RmKg(100, null)).toBe(0);
        expect(epley1RmKg(0, 5)).toBe(0);
        expect(epley1RmKg(100, 0)).toBe(0);
      });
    });

    describe('estimateRepMaxKg', () => {
      it('is the identity at the same rep count', () => {
        expect(estimateRepMaxKg(60, 10, 10)).toBeCloseTo(60, 5);
      });

      it('estimates a 10RM from a 5-rep set', () => {
        // e1RM = 116.667 → 10RM = 116.667 / (1 + 10/30) = 87.5
        expect(estimateRepMaxKg(100, 5, 10)).toBeCloseTo(87.5, 2);
      });

      it('returns 0 when the source set is empty', () => {
        expect(estimateRepMaxKg(null, null, 10)).toBe(0);
      });
    });

    describe('setVolumeKg / getExerciseVolumeKg', () => {
      const set = (weight: number | null, reps: number | null, set_type = 'normal') =>
        ({ id: 1, set_number: 1, set_type, reps, weight, duration: null, rest_time: null, notes: null, rpe: null });

      it('computes weight × reps, treating null as 0', () => {
        expect(setVolumeKg(set(60, 10))).toBe(600);
        expect(setVolumeKg(set(null, 10))).toBe(0);
        expect(setVolumeKg(set(60, null))).toBe(0);
      });

      it('excludes warmup sets from exercise volume', () => {
        const exercise = {
          id: 'e1',
          exercise_id: 'x1',
          duration_minutes: 0,
          calories_burned: 0,
          entry_date: null,
          notes: null,
          distance: null,
          avg_heart_rate: null,
          source: null,
          exercise_snapshot: null,
          activity_details: [],
          sets: [set(40, 12, 'warmup'), set(60, 10), set(70, 8)],
        };
        expect(getExerciseVolumeKg(exercise as any)).toBe(600 + 560);
      });
    });

    describe('formatVolume', () => {
      it('rounds and appends the unit, converting for lbs', () => {
        expect(formatVolume(1000, 'kg')).toBe(`${fmt(1000)} kg`);
        // 1000 kg ≈ 2204.6 lbs
        expect(formatVolume(1000, 'lbs')).toBe(`${fmt(2205)} lbs`);
      });
    });

    describe('getRpeTone', () => {
      it('buckets RPE into easy/moderate/hard/max', () => {
        expect(getRpeTone(6)).toBe('easy');
        expect(getRpeTone(7)).toBe('easy');
        expect(getRpeTone(7.5)).toBe('moderate');
        expect(getRpeTone(8.5)).toBe('moderate');
        expect(getRpeTone(9)).toBe('hard');
        expect(getRpeTone(9.5)).toBe('hard');
        expect(getRpeTone(10)).toBe('max');
      });
    });
  });

  describe('supersets', () => {
    const entry = (id: string, group: number | null | undefined) => ({
      id,
      superset_group: group as number | null,
    });

    describe('getSupersetRuns', () => {
      it('returns adjacent runs of 2+ sharing a non-null group', () => {
        const runs = getSupersetRuns([
          entry('a', 1),
          entry('b', 1),
          entry('c', null),
        ]);
        expect(runs).toEqual([{ groupId: 1, entryIds: ['a', 'b'] }]);
      });

      it('ignores singleton group values', () => {
        expect(
          getSupersetRuns([entry('a', 1), entry('b', null), entry('c', 2)]),
        ).toEqual([]);
      });

      it('ignores non-adjacent repeats of the same group value', () => {
        expect(
          getSupersetRuns([entry('a', 1), entry('b', null), entry('c', 1)]),
        ).toEqual([]);
      });

      it('splits two adjacent groups with different ids', () => {
        const runs = getSupersetRuns([
          entry('a', 1),
          entry('b', 1),
          entry('c', 2),
          entry('d', 2),
          entry('e', 2),
        ]);
        expect(runs).toEqual([
          { groupId: 1, entryIds: ['a', 'b'] },
          { groupId: 2, entryIds: ['c', 'd', 'e'] },
        ]);
      });

      it('treats pre-upgrade exercises without the field as ungrouped', () => {
        expect(
          getSupersetRuns([entry('a', undefined), entry('b', undefined)]),
        ).toEqual([]);
      });
    });

    describe('buildSupersetColorMap', () => {
      const palette = ['red', 'green', 'blue'];

      it('assigns colours by run index and covers every member', () => {
        const map = buildSupersetColorMap(
          [
            { groupId: 5, entryIds: ['a', 'b'] },
            { groupId: 2, entryIds: ['c', 'd'] },
          ],
          palette,
        );
        expect(map.get('a')).toBe('red');
        expect(map.get('b')).toBe('red');
        expect(map.get('c')).toBe('green');
        expect(map.get('d')).toBe('green');
        expect(map.has('e')).toBe(false);
      });

      it('wraps past the palette length', () => {
        const runs = ['g1', 'g2', 'g3', 'g4'].map((_, i) => ({
          groupId: i + 1,
          entryIds: [`x${i}`],
        }));
        const map = buildSupersetColorMap(runs, palette);
        expect(map.get('x3')).toBe('red');
      });

      it('returns an empty map for an empty palette', () => {
        expect(
          buildSupersetColorMap([{ groupId: 1, entryIds: ['a'] }], []).size,
        ).toBe(0);
      });
    });
  });

  describe('exercise reordering', () => {
    // The movers only read id/superset_group and spread the rest, so a narrow
    // shape stands in for a full ExerciseEntryResponse.
    const sEntry = (id: string, group: number | null): ExerciseEntryResponse =>
      ({ id, superset_group: group }) as unknown as ExerciseEntryResponse;

    const dEntry = (clientId: string, group: number | null): WorkoutDraftExercise => ({
      clientId,
      exerciseId: `ex-${clientId}`,
      exerciseName: clientId,
      exerciseCategory: null,
      images: [],
      supersetGroup: group,
      sets: [],
    });

    describe('buildExerciseReorderItems', () => {
      it('returns one item per solo exercise', () => {
        expect(
          buildExerciseReorderItems([
            { id: 'a', superset_group: null },
            { id: 'b', superset_group: null },
          ]),
        ).toEqual([
          { key: 'a', entryIds: ['a'], groupId: null },
          { key: 'b', entryIds: ['b'], groupId: null },
        ]);
      });

      it('collapses an adjacent run into one item', () => {
        expect(
          buildExerciseReorderItems([
            { id: 'a', superset_group: 1 },
            { id: 'b', superset_group: 1 },
            { id: 'c', superset_group: null },
          ]),
        ).toEqual([
          { key: 'a', entryIds: ['a', 'b'], groupId: 1 },
          { key: 'c', entryIds: ['c'], groupId: null },
        ]);
      });

      it('treats stale same-value singletons as solo items', () => {
        // Non-adjacent repeats of group 1 are not a run.
        expect(
          buildExerciseReorderItems([
            { id: 'a', superset_group: 1 },
            { id: 'b', superset_group: null },
            { id: 'c', superset_group: 1 },
          ]),
        ).toEqual([
          { key: 'a', entryIds: ['a'], groupId: null },
          { key: 'b', entryIds: ['b'], groupId: null },
          { key: 'c', entryIds: ['c'], groupId: null },
        ]);
      });
    });

    describe('moveSessionExerciseItem', () => {
      const ids = (arr: ExerciseEntryResponse[]) => arr.map((e) => e.id);

      it('moves a solo item down', () => {
        const input = [sEntry('a', null), sEntry('b', null), sEntry('c', null)];
        expect(ids(moveSessionExerciseItem(input, 0, 2))).toEqual(['b', 'c', 'a']);
      });

      it('moves a solo item up', () => {
        const input = [sEntry('a', null), sEntry('b', null), sEntry('c', null)];
        expect(ids(moveSessionExerciseItem(input, 2, 0))).toEqual(['c', 'a', 'b']);
      });

      it('swaps first and last (both directions)', () => {
        const input = [sEntry('a', null), sEntry('b', null)];
        expect(ids(moveSessionExerciseItem(input, 0, 1))).toEqual(['b', 'a']);
        expect(ids(moveSessionExerciseItem(input, 1, 0))).toEqual(['b', 'a']);
      });

      it('returns the input array identity on a same-index move', () => {
        const input = [sEntry('a', null), sEntry('b', null)];
        expect(moveSessionExerciseItem(input, 1, 1)).toBe(input);
      });

      it('returns the input array identity on an out-of-range move', () => {
        const input = [sEntry('a', null), sEntry('b', null)];
        expect(moveSessionExerciseItem(input, 0, 5)).toBe(input);
        expect(moveSessionExerciseItem(input, -1, 0)).toBe(input);
      });

      it('moves a whole run as one indivisible block', () => {
        // items: [x], [a+b run], [y] — move the run (item 1) to the front.
        const input = [sEntry('x', null), sEntry('a', 1), sEntry('b', 1), sEntry('y', null)];
        expect(ids(moveSessionExerciseItem(input, 1, 0))).toEqual(['a', 'b', 'x', 'y']);
      });

      it('never drops a solo into the middle of a run', () => {
        // items: [a+b run], [c] — moving c to the front lands before the run.
        const input = [sEntry('a', 1), sEntry('b', 1), sEntry('c', null)];
        expect(ids(moveSessionExerciseItem(input, 1, 0))).toEqual(['c', 'a', 'b']);
      });

      it('clears stale singleton groups so a move cannot fuse them', () => {
        // Two non-adjacent group-1 singletons; sliding the middle solo out
        // makes them adjacent, which must NOT spawn a group-1 run.
        const input = [sEntry('a', 1), sEntry('m', null), sEntry('b', 1)];
        const out = moveSessionExerciseItem(input, 1, 2);
        expect(ids(out)).toEqual(['a', 'b', 'm']);
        expect(getSupersetRuns(out)).toEqual([]);
        expect(out.map((e) => e.superset_group)).toEqual([null, null, null]);
      });

      it('does not mutate the input array or its entries', () => {
        const a = sEntry('a', 1);
        const b = sEntry('b', 1);
        const c = sEntry('c', null);
        const input = [a, b, c];
        const snapshot = input.map((e) => ({ ...e }));
        moveSessionExerciseItem(input, 1, 0);
        expect(input).toEqual(snapshot);
        expect(input[0]).toBe(a);
      });
    });

    describe('moveDraftExerciseItem', () => {
      const ids = (arr: WorkoutDraftExercise[]) => arr.map((e) => e.clientId);

      it('derives items identically to the session mover (mirrored order/groups)', () => {
        const draft = [dEntry('a', 1), dEntry('b', 1), dEntry('c', null)];
        const session = draft.map((e) => sEntry(e.clientId, e.supersetGroup ?? null));
        expect(ids(moveDraftExerciseItem(draft, 1, 0))).toEqual(
          moveSessionExerciseItem(session, 1, 0).map((e) => e.id),
        );
      });

      it('clears stale draft singleton groups on a move', () => {
        const draft = [dEntry('a', 1), dEntry('m', null), dEntry('b', 1)];
        const out = moveDraftExerciseItem(draft, 1, 2);
        expect(ids(out)).toEqual(['a', 'b', 'm']);
        expect(out.map((e) => e.supersetGroup)).toEqual([null, null, null]);
      });

      it('returns identity on a no-op move', () => {
        const draft = [dEntry('a', null), dEntry('b', null)];
        expect(moveDraftExerciseItem(draft, 0, 0)).toBe(draft);
      });
    });
  });

  describe('makeSparseExercise', () => {
    it('fills the known fields and leaves the rest empty for hydration', () => {
      const exercise = makeSparseExercise({
        id: 'ex-1',
        name: 'Bench Press',
        category: 'Strength',
        images: ['bench.png'],
      });
      expect(exercise).toMatchObject({
        id: 'ex-1',
        name: 'Bench Press',
        category: 'Strength',
        images: ['bench.png'],
        equipment: [],
        primary_muscles: [],
        secondary_muscles: [],
        calories_per_hour: 0,
        source: '',
        tags: [],
        userId: null,
      });
    });

    it('defaults name and nullable/array fields when omitted', () => {
      const exercise = makeSparseExercise({ id: 'ex-2' });
      expect(exercise.name).toBe('Exercise');
      expect(exercise.category).toBeNull();
      expect(exercise.images).toEqual([]);
    });
  });

  describe('exerciseFromDraft', () => {
    const baseDraft: WorkoutDraftExercise = {
      clientId: 'c1',
      exerciseId: 'ex-9',
      exerciseName: 'Squat',
      exerciseCategory: 'Strength',
      images: ['squat.png'],
      sets: [],
    };

    it('maps a snapshotless draft to a sparse Exercise keyed by exerciseId', () => {
      const exercise = exerciseFromDraft(baseDraft);
      expect(exercise).toMatchObject({
        id: 'ex-9',
        name: 'Squat',
        category: 'Strength',
        images: ['squat.png'],
        primary_muscles: [],
      });
    });

    it('prefers the full snapshot when the draft carries one', () => {
      const snapshot: ExerciseSnapshotResponse = {
        id: 'snap-9',
        name: 'Barbell Squat',
        category: 'Strength',
        images: ['snap.png'],
        primary_muscles: ['quadriceps'],
        secondary_muscles: ['glutes'],
        equipment: ['barbell'],
        instructions: ['Brace and descend.'],
        force: null,
        level: null,
        mechanic: null,
      };
      const exercise = exerciseFromDraft({ ...baseDraft, snapshot });
      expect(exercise).toMatchObject({
        id: 'snap-9',
        name: 'Barbell Squat',
        primary_muscles: ['quadriceps'],
        equipment: ['barbell'],
      });
    });
  });
});
