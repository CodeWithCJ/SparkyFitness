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
  buildPresetUpdateExercises,
  buildSessionExercisesPayload,
  buildSingleExerciseStartPayload,
  draftExerciseToCardExercise,
  presetExerciseToCardExercise,
  DEFAULT_REST_SEC,
  isTempSetId,
  epley1RmKg,
  estimateRepMaxKg,
  setVolumeKg,
  getExerciseVolumeKg,
  formatVolume,
  formatRecentSessionSet,
  describeActiveSet,
  describeActiveSetAssumed,
  resolveAssumedSetValues,
  extractPlannedSetValues,
  stripPlannedSetValues,
  formatSetLoad,
  formatRestCountdown,
  normalizeWeightUnit,
  getRpeTone,
  getSupersetRuns,
  buildSupersetColorMap,
  buildExerciseReorderItems,
  moveSessionExerciseItem,
  moveDraftExerciseItem,
  isWarmupSetType,
  setTypeLetter,
  summarizeWorkoutSpan,
  WORKOUT_LONG_GAP_MINUTES,
  buildWorkoutCompletionSummary,
  seedPrFromSession,
  compareSetRecords,
  matchesSetRecord,
  exerciseFromExternalItem,
  makeSparseExercise,
  exerciseFromDraft,
  resolveSnapshotModality,
  isDurationModality,
  effectiveSetDurationSec,
  formatDurationSeconds,
  buildActivitySetsPayload,
} from '../../src/utils/workoutSession';
import type {
  ExerciseEntryResponse,
  ExerciseSessionResponse,
  ExerciseSnapshotResponse,
} from '@workspace/shared';
import {
  presetSessionExerciseRequestSchema,
  canEditGroupedWorkout,
  workoutPresetExerciseRequestSchema,
} from '@workspace/shared';
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
      expect(getSourceLabel(null)).toBe('Sparky');
    });

    it('returns Sparky for undefined source', () => {
      expect(getSourceLabel(undefined)).toBe('Sparky');
    });

    it('returns Sparky for "manual" source', () => {
      expect(getSourceLabel('manual')).toBe('Sparky');
    });

    it('returns Sparky for "sparky" source', () => {
      expect(getSourceLabel('sparky')).toBe('Sparky');
    });

    it('returns Sparky for "Workout Plan" source', () => {
      expect(getSourceLabel('Workout Plan')).toBe('Sparky');
    });

    it('returns Sparky for a padded "WORKOUT PLAN" source', () => {
      expect(getSourceLabel('  WORKOUT PLAN  ')).toBe('Sparky');
    });

    it('returns Apple Health for HealthKit source', () => {
      expect(getSourceLabel('HealthKit')).toBe('Apple Health');
    });

    it('returns Garmin for garmin source (lowercase)', () => {
      expect(getSourceLabel('garmin')).toBe('Garmin');
    });

    it('returns Garmin for Garmin source (capitalized)', () => {
      expect(getSourceLabel('Garmin')).toBe('Garmin');
    });

    it('returns Health Connect for Health Connect source', () => {
      expect(getSourceLabel('Health Connect')).toBe('Health Connect');
    });

    it('returns the trimmed source string as-is for unknown sources', () => {
      expect(getSourceLabel('MyFitnessPal')).toBe('MyFitnessPal');
    });
  });

  describe('canEditGroupedWorkout', () => {
    it.each([
      ['manual', true],
      ['sparky', true],
      ['Workout Plan', true],
      ['WORKOUT PLAN', true],
      ['  Workout Plan  ', true],
      [null, true],
      [undefined, true],
      ['Health Connect', false],
      ['garmin', false],
      ['Some Unknown Source', false],
    ])('returns %s for source %j', (source, expected) => {
      expect(canEditGroupedWorkout(source)).toBe(expected);
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
        expect(buildSessionSubtitle(session, 60, 300)).toBe('2 exercises · 3 sets · 300 Cal');
      });

      it('omits calories when zero', () => {
        const session = makePreset({
          exercises: [
            {
              exercise_id: 'ex-1',
              exercise_snapshot: null as any,
              sets: [{ weight: null, reps: null }],
              calories_burned: 0,
              duration_minutes: 0,
            } as any,
          ],
        });
        expect(buildSessionSubtitle(session, 60, 0)).toBe('1 exercise · 1 sets');
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
        expect(buildSessionSubtitle(session, 60, 300)).toBe(`1 exercise · 2 sets · ${fmt(1140)} kg · 300 Cal`);
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
        expect(buildSessionSubtitle(session, 60, 300)).toBe('1 exercise · 2 sets · 300 Cal');
      });

      it('excludes cardio efforts from the set count and shows their distance instead', () => {
        const session = makePreset({
          exercises: [
            {
              exercise_id: 'ex-1',
              exercise_snapshot: { modality: 'duration_distance' } as any,
              distance: 5.2,
              sets: [{ weight: null, reps: null, duration: 1500 }],
              calories_burned: 200,
              duration_minutes: 25,
            } as any,
            {
              exercise_id: 'ex-2',
              exercise_snapshot: null as any,
              sets: [{ weight: 100, reps: 5 }],
              calories_burned: 0,
              duration_minutes: 0,
            } as any,
          ],
        });
        expect(buildSessionSubtitle(session, 40, 300)).toBe(
          '2 exercises · 1 sets · 500 kg · 5.2 km · 300 Cal',
        );
      });

      it('drops the sets segment entirely for a cardio-only workout', () => {
        const cardio = (id: string, distance: number, duration: number) =>
          ({
            exercise_id: id,
            exercise_snapshot: { modality: 'duration_distance' } as any,
            distance,
            sets: [{ weight: null, reps: null, duration }],
            calories_burned: 200,
            duration_minutes: duration / 60,
          }) as any;
        const session = makePreset({
          exercises: [cardio('ex-1', 5, 1500), cardio('ex-2', 10, 1800)],
        });
        expect(buildSessionSubtitle(session, 55, 500)).toBe('2 exercises · 15.0 km · 500 Cal');
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
        expect(buildSessionSubtitle(session, 60, 300)).toBe('1 exercise · 300 Cal');
      });
    });

    describe('individual with multiple sets', () => {
      // The default fixture's Cardio category would route these through the
      // cardio/activity branch; strength-set behavior needs a strength snapshot.
      const makeStrengthIndividual = (
        overrides?: Partial<IndividualSession>,
      ): IndividualSession =>
        makeIndividual({
          exercise_snapshot: {
            ...makeIndividual().exercise_snapshot!,
            name: 'Bench Press',
            category: 'Strength',
          },
          ...overrides,
        });

      it('shows sets count with duration and calories', () => {
        const session = makeStrengthIndividual({
          sets: [
            { weight: null, reps: null },
            { weight: null, reps: null },
            { weight: null, reps: null },
          ] as any,
        });
        expect(buildSessionSubtitle(session, 45, 200)).toBe('3 sets · 45 min · 200 Cal');
      });

      it('includes volume when sets have weight and reps', () => {
        const session = makeStrengthIndividual({
          sets: [
            { weight: 60, reps: 10 },  // 600 kg
            { weight: 60, reps: 8 },   // 480 kg
          ] as any,
        });
        // 1080 kg total
        expect(buildSessionSubtitle(session, 30, 150)).toBe(`2 sets · ${fmt(1080)} kg · 30 min · 150 Cal`);
      });

      it('converts volume to lbs', () => {
        const session = makeStrengthIndividual({
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
        const session = makeStrengthIndividual({
          sets: [
            { weight: 0, reps: 10 },
            { weight: 0, reps: 10 },
          ] as any,
        });
        expect(buildSessionSubtitle(session, 30, 200)).toBe('2 sets · 30 min · 200 Cal');
      });

      it('omits duration when zero', () => {
        const session = makeStrengthIndividual({
          sets: [
            { weight: 40, reps: 10 },
            { weight: 40, reps: 10 },
          ] as any,
        });
        // 800 kg volume
        expect(buildSessionSubtitle(session, 0, 150)).toBe('2 sets · 800 kg · 150 Cal');
      });

      it('omits calories when zero', () => {
        const session = makeStrengthIndividual({
          sets: [
            { weight: null, reps: null },
            { weight: null, reps: null },
          ] as any,
        });
        expect(buildSessionSubtitle(session, 20, 0)).toBe('2 sets · 20 min');
      });

      it('shows only set count when volume, duration, and calories are all zero', () => {
        const session = makeStrengthIndividual({
          sets: [
            { weight: 0, reps: 0 },
            { weight: null, reps: null },
          ] as any,
        });
        expect(buildSessionSubtitle(session, 0, 0)).toBe('2 sets');
      });

      it('routes a set-backed cardio activity through the entry totals (never "1 set")', () => {
        const session = makeIndividual({
          distance: 5.2,
          sets: [{ weight: null, reps: null, duration: 1800, distance: 5.2 }] as any,
        });
        expect(buildSessionSubtitle(session, 30, 300)).toBe('30 min · 5.2 km · 300 Cal');
      });

      it('routes multi-set cardio through the entry totals too', () => {
        const session = makeIndividual({
          distance: 4,
          sets: [
            { weight: null, reps: null, duration: 600, distance: 2 },
            { weight: null, reps: null, duration: 600, distance: 2 },
          ] as any,
        });
        expect(buildSessionSubtitle(session, 20, 200)).toBe('20 min · 4.0 km · 200 Cal');
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
          exercise_snapshot: {
            ...makeIndividual().exercise_snapshot!,
            name: 'Bench Press',
            category: 'Strength',
          },
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

    it('defaults duration_minutes to 0 when the draft has none', () => {
      const payload = buildExercisesPayload([makeDraftExercise()], 'kg', 'km');
      expect(payload[0].duration_minutes).toBe(0);
    });

    it('round-trips durationMinutes so edit-saves cannot zero stored durations', () => {
      const payload = buildExercisesPayload(
        [makeDraftExercise({ durationMinutes: 23.5 })],
        'kg',
        'km',
      );
      expect(payload[0].duration_minutes).toBe(23.5);
    });

    it('omits calories_burned unless the user edited the field', () => {
      const seeded = buildExercisesPayload(
        [makeDraftExercise({ calories: '150', caloriesManuallySet: false })],
        'kg',
        'km',
      );
      expect(seeded[0]).not.toHaveProperty('calories_burned');

      const edited = buildExercisesPayload(
        [makeDraftExercise({ calories: '150', caloriesManuallySet: true })],
        'kg',
        'km',
      );
      expect(edited[0].calories_burned).toBe(150);
    });

    it('omits calories_burned when the user cleared the field', () => {
      const payload = buildExercisesPayload(
        [makeDraftExercise({ calories: '', caloriesManuallySet: true })],
        'kg',
        'km',
      );
      expect(payload[0]).not.toHaveProperty('calories_burned');
    });

    it('maps sets with 1-based set_number', () => {
      const exercise = makeDraftExercise({
        sets: [
          { clientId: 's1', weight: '100', reps: '10' },
          { clientId: 's2', weight: '90', reps: '8' },
        ],
      });
      const payload = buildExercisesPayload([exercise], 'kg', 'km');
      expect(payload[0].sets[0].set_number).toBe(1);
      expect(payload[0].sets[1].set_number).toBe(2);
    });

    it('passes weight as-is in kg when unit is kg', () => {
      const exercise = makeDraftExercise({
        sets: [{ clientId: 's1', weight: '100', reps: '10' }],
      });
      const payload = buildExercisesPayload([exercise], 'kg', 'km');
      expect(payload[0].sets[0].weight).toBe(100);
      expect(payload[0].sets[0].reps).toBe(10);
    });

    it('converts weight from lbs to kg when unit is lbs', () => {
      const exercise = makeDraftExercise({
        sets: [{ clientId: 's1', weight: '225', reps: '5' }],
      });
      const payload = buildExercisesPayload([exercise], 'lbs', 'km');
      // 225 lbs * 0.45359237 ≈ 102.06
      expect(payload[0].sets[0].weight).toBeCloseTo(102.058, 1);
      expect(payload[0].sets[0].reps).toBe(5);
    });

    it('emits set distance in km as-is when unit is km', () => {
      const exercise = makeDraftExercise({
        sets: [{ clientId: 's1', weight: '', reps: '', distance: '5.2', duration: 1800 }],
      });
      const payload = buildExercisesPayload([exercise], 'kg', 'km');
      expect(payload[0].sets[0].distance).toBe(5.2);
    });

    it('converts set distance from miles to km when unit is miles', () => {
      const exercise = makeDraftExercise({
        sets: [{ clientId: 's1', weight: '', reps: '', distance: '3.1', duration: 1800 }],
      });
      const payload = buildExercisesPayload([exercise], 'kg', 'miles');
      // 3.1 mi * 1.609344 ≈ 4.99
      expect(payload[0].sets[0].distance).toBeCloseTo(4.989, 2);
    });

    it('emits null distance for empty or missing distance text', () => {
      const exercise = makeDraftExercise({
        sets: [
          { clientId: 's1', weight: '100', reps: '10', distance: '' },
          { clientId: 's2', weight: '90', reps: '8' },
        ],
      });
      const payload = buildExercisesPayload([exercise], 'kg', 'km');
      expect(payload[0].sets[0].distance).toBeNull();
      expect(payload[0].sets[1].distance).toBeNull();
    });

    it('derives cardio duration_minutes from the sets, ignoring the round-tripped value', () => {
      const exercise = makeDraftExercise({
        exerciseModality: 'duration_distance',
        durationMinutes: 99,
        sets: [
          { clientId: 's1', weight: '', reps: '', distance: '5', duration: 1800, restTime: 0 },
        ],
      });
      const payload = buildExercisesPayload([exercise], 'kg', 'km');
      expect(payload[0].duration_minutes).toBe(30);
    });

    it('keeps round-tripped duration_minutes on non-cardio exercises', () => {
      const exercise = makeDraftExercise({
        exerciseModality: 'weight_reps',
        durationMinutes: 23.5,
        sets: [{ clientId: 's1', weight: '100', reps: '10', duration: 1800 }],
      });
      const payload = buildExercisesPayload([exercise], 'kg', 'km');
      expect(payload[0].duration_minutes).toBe(23.5);
    });

    it('returns null for weight when value is not a number', () => {
      const exercise = makeDraftExercise({
        sets: [{ clientId: 's1', weight: '', reps: '10' }],
      });
      const payload = buildExercisesPayload([exercise], 'kg', 'km');
      expect(payload[0].sets[0].weight).toBeNull();
    });

    it('returns null for reps when value is not a number', () => {
      const exercise = makeDraftExercise({
        sets: [{ clientId: 's1', weight: '100', reps: '' }],
      });
      const payload = buildExercisesPayload([exercise], 'kg', 'km');
      expect(payload[0].sets[0].reps).toBeNull();
    });

    it('returns null for both when both are empty strings', () => {
      const exercise = makeDraftExercise({
        sets: [{ clientId: 's1', weight: '', reps: '' }],
      });
      const payload = buildExercisesPayload([exercise], 'kg', 'km');
      expect(payload[0].sets[0].weight).toBeNull();
      expect(payload[0].sets[0].reps).toBeNull();
    });

    it('returns null for non-numeric strings', () => {
      const exercise = makeDraftExercise({
        sets: [{ clientId: 's1', weight: 'abc', reps: 'xyz' }],
      });
      const payload = buildExercisesPayload([exercise], 'kg', 'km');
      expect(payload[0].sets[0].weight).toBeNull();
      expect(payload[0].sets[0].reps).toBeNull();
    });

    it('handles decimal weight strings', () => {
      const exercise = makeDraftExercise({
        sets: [{ clientId: 's1', weight: '62.5', reps: '8' }],
      });
      const payload = buildExercisesPayload([exercise], 'kg', 'km');
      expect(payload[0].sets[0].weight).toBe(62.5);
    });

    it('truncates decimal reps via parseInt', () => {
      const exercise = makeDraftExercise({
        sets: [{ clientId: 's1', weight: '100', reps: '8.7' }],
      });
      const payload = buildExercisesPayload([exercise], 'kg', 'km');
      expect(payload[0].sets[0].reps).toBe(8);
    });

    it('returns empty array for empty exercises', () => {
      expect(buildExercisesPayload([], 'kg', 'km')).toEqual([]);
    });

    it('round-trips supersetGroup opaquely and defaults missing values to null', () => {
      const payload = buildExercisesPayload(
        [
          makeDraftExercise({ supersetGroup: 2 }),
          makeDraftExercise({ supersetGroup: null }),
          makeDraftExercise(),
        ],
        'kg',
        'km',
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
        'km',
      );
      expect(payload[0].sets[0].completed_at).toBe(completedAt);
      // A new form set has no completion — the server stores null.
      expect(payload[0].sets[1].completed_at).toBeNull();
    });

    it('handles exercise with empty sets array', () => {
      const exercise = makeDraftExercise({ sets: [] });
      const payload = buildExercisesPayload([exercise], 'kg', 'km');
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
          'km',
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
          'km',
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
          'km',
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
          'km',
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
          'km',
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
          'km',
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
          'km',
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
          'km',
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

    it('round-trips set_type and notes, sanitizing duration off non-duration modalities', () => {
      const payload = buildPresetExercisesPayload(
        [
          makeDraftExercise({
            sets: [
              {
                clientId: 's1',
                weight: '50',
                reps: '10',
                setType: 'warmup',
                // Junk carried in from a logged session (the old "Save as
                // Preset" duration leak) — a weights exercise must not keep it.
                duration: 45,
                notes: 'easy set',
              },
            ],
          }),
        ],
        'kg',
        'km',
      );
      expect(payload[0].sets[0].set_type).toBe('warmup');
      expect(payload[0].sets[0].duration).toBeNull();
      expect(payload[0].sets[0].notes).toBe('easy set');
    });

    it('keeps duration on duration-modality exercises', () => {
      const payload = buildPresetExercisesPayload(
        [
          makeDraftExercise({
            exerciseCategory: 'Isometric',
            sets: [{ clientId: 's1', weight: '', reps: '', duration: 45 }],
          }),
        ],
        'kg',
        'km',
      );
      expect(payload[0].sets[0].duration).toBe(45);
    });

    it('converts cardio distance to km and nulls it on non-cardio exercises', () => {
      const payload = buildPresetExercisesPayload(
        [
          makeDraftExercise({
            exerciseCategory: 'Cardio',
            sets: [{ clientId: 's1', weight: '', reps: '', duration: 1500, distance: '3.11' }],
          }),
          makeDraftExercise({
            exerciseId: 'ex-2',
            sets: [{ clientId: 's2', weight: '50', reps: '10', distance: '3.11' }],
          }),
        ],
        'kg',
        'miles',
      );
      expect(payload[0].sets[0].distance).toBeCloseTo(5.005, 2);
      expect(payload[1].sets[0].distance).toBeNull();
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
          'km',
        );
        expect(card.id).toBe('c1');
        expect(card.exercise_id).toBe('ex-1');
        expect(card.superset_group).toBe(2);
        expect(card.exercise_snapshot).toEqual({
          name: 'Bench Press',
          category: 'Strength',
          modality: null,
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
          'km',
        );
        expect(card.exercise_snapshot).toBe(snapshot);
      });

      it('maps empty draft strings to null weight/reps', () => {
        const card = draftExerciseToCardExercise(
          makeDraftExercise({ sets: [{ clientId: 's1', weight: '', reps: '' }] }),
          'kg',
          'km',
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
          'km',
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
          modality: null,
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
          notes: null,
          duration: 60,
          distance: null,
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
          expect(String(exercise.id).startsWith('temp-')).toBe(false);
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
        distance: null,
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
        distance: null,
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

    it('added exercise: sends its client uuid and omits only the negative temp set id', () => {
      // A mid-workout add carries a real client uuid + a negative temp set id.
      // The entry id is always sent (server adopts it via reconcile-create);
      // only the temp set id is omitted so the server INSERTs it.
      const ADDED = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      const session = makePreset({
        exercises: [
          makeExercise({ id: ENTRY_A, sets: [makeSet({ id: 101 })] }),
          makeExercise({
            id: ADDED,
            exercise_id: EX_2,
            sets: [makeSet({ id: -1 })],
          }),
        ],
      });

      const payload = buildSessionExercisesPayload(session, {}, {});
      expect(payload[0].id).toBe(ENTRY_A);
      expect((payload[0].sets[0] as { id?: number }).id).toBe(101);
      expect(payload[1].id).toBe(ADDED);
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

      const cardioSnapshot = {
        modality: 'duration_distance',
      } as SessionExercise['exercise_snapshot'];

      it('excludes cardio entries from the split; their duration is the set sum', () => {
        const session = makePreset({
          exercises: [
            makeExercise({
              sets: [makeSet({ id: 101 }), makeSet({ id: 102, set_number: 2 })],
            }),
            makeExercise({
              id: ENTRY_B,
              exercise_id: EX_2,
              exercise_snapshot: cardioSnapshot,
              sets: [
                makeSet({
                  id: 201,
                  reps: null,
                  weight: null,
                  duration: 1800,
                  rest_time: 0,
                  distance: 5.2,
                }),
              ],
            }),
          ],
        });

        // The cardio set completed last: without the exclusion it would both
        // join the split and stretch the strength entries' span.
        const completed = { '101': min(5), '102': min(12), '201': min(45) };
        const payload = buildSessionExercisesPayload(session, completed, {}, startedAt);
        expect(payload[0].duration_minutes).toBe(12); // full strength span
        expect(payload[1].duration_minutes).toBe(30); // 1800s set sum
      });

      it('derives a cardio-only session from its sets even though the split prices nothing', () => {
        const session = makePreset({
          exercises: [
            makeExercise({
              exercise_snapshot: cardioSnapshot,
              duration_minutes: 0,
              sets: [
                makeSet({ id: 101, reps: null, weight: null, duration: 1500, rest_time: 0 }),
              ],
            }),
          ],
        });
        const payload = buildSessionExercisesPayload(session, { '101': min(25) }, {}, startedAt);
        expect(payload[0].duration_minutes).toBe(25);
      });

      it('zeroes a stale strength duration when only cardio completed (regression: 25+5 showing as 58)', () => {
        const session = makePreset({
          exercises: [
            // Stale estimate from an earlier flush; nothing here was completed.
            makeExercise({ duration_minutes: 28, sets: [makeSet({ id: 101 })] }),
            makeExercise({
              id: ENTRY_B,
              exercise_id: EX_2,
              exercise_snapshot: cardioSnapshot,
              sets: [
                makeSet({ id: 201, reps: null, weight: null, duration: 1500, rest_time: 0 }),
              ],
            }),
          ],
        });
        const payload = buildSessionExercisesPayload(session, { '201': min(25) }, {}, startedAt);
        expect(payload[0].duration_minutes).toBe(0);
        expect(payload[1].duration_minutes).toBe(25);
      });

      it('keeps a strength duration whose completions predate the start while cardio completed after it', () => {
        const session = makePreset({
          exercises: [
            makeExercise({ duration_minutes: 25, sets: [makeSet({ id: 101 })] }),
            makeExercise({
              id: ENTRY_B,
              exercise_id: EX_2,
              exercise_snapshot: cardioSnapshot,
              sets: [
                makeSet({ id: 201, reps: null, weight: null, duration: 300, rest_time: 0 }),
              ],
            }),
          ],
        });
        const payload = buildSessionExercisesPayload(
          session,
          { '101': startedAt - 60_000, '201': min(5) },
          {},
          startedAt,
        );
        expect(payload[0].duration_minutes).toBe(25);
        expect(payload[1].duration_minutes).toBe(5);
      });
    });

    it('emits per-set distance and nulls it when absent', () => {
      const session = makePreset({
        exercises: [
          makeExercise({
            sets: [
              makeSet({ id: 101, distance: 5.2 }),
              makeSet({ id: 102, set_number: 2 }),
            ],
          }),
        ],
      });
      const payload = buildSessionExercisesPayload(session, {}, {});
      expect(payload[0].sets[0].distance).toBe(5.2);
      expect(payload[0].sets[1].distance).toBeNull();
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

    it('carries completed_at on a temp set whose id is omitted', () => {
      const completedMs = Date.UTC(2026, 2, 20, 10, 30, 0);
      const ADDED = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      const session = makePreset({
        exercises: [
          makeExercise({ id: ENTRY_A, sets: [makeSet({ id: 101 })] }),
          makeExercise({
            id: ADDED,
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
      // The existing set keeps its id; the temp set's id is omitted — but its
      // completion still travels in the row so the server-INSERTed set is done.
      expect((payload[0].sets[0] as { id?: number }).id).toBe(101);
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

    it('carries is_pr on a temp set whose id is omitted', () => {
      const ADDED = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      const session = makePreset({
        exercises: [
          makeExercise({ id: ENTRY_A, sets: [makeSet({ id: 101 })] }),
          makeExercise({
            id: ADDED,
            exercise_id: EX_2,
            sets: [makeSet({ id: -1 })],
          }),
        ],
      });

      const payload = buildSessionExercisesPayload(session, {}, { '101': true, '-1': true });
      expect((payload[0].sets[0] as { id?: number }).id).toBe(101);
      expect(payload[0].sets[0].is_pr).toBe(true);
      expect(payload[1].sets[0]).not.toHaveProperty('id');
      expect(payload[1].sets[0].is_pr).toBe(true);
    });
  });

  describe('summarizeWorkoutSpan', () => {
    const MIN = 60_000;
    const start = 1_000_000;

    it('returns null without a start time', () => {
      expect(summarizeWorkoutSpan({ '1': start + MIN }, null)).toBeNull();
    });

    it('returns null with no completions after the start', () => {
      expect(summarizeWorkoutSpan({}, start)).toBeNull();
      // Seeded completions predating the start (resumed session) are ignored.
      expect(summarizeWorkoutSpan({ '1': start - 5 * MIN }, start)).toBeNull();
    });

    it('reports a steady workout with no long gap', () => {
      const span = summarizeWorkoutSpan(
        { '1': start + 2 * MIN, '2': start + 5 * MIN, '3': start + 8 * MIN },
        start,
      );
      expect(span).toEqual({ totalMinutes: 8, activeMinutes: 8, hasLongGap: false });
    });

    it('excludes long gaps from active time', () => {
      const span = summarizeWorkoutSpan(
        { '1': start + 5 * MIN, '2': start + 10 * MIN, '3': start + 720 * MIN },
        start,
      );
      expect(span).toEqual({ totalMinutes: 720, activeMinutes: 10, hasLongGap: true });
    });

    it('flags a long start-to-first-set gap', () => {
      const span = summarizeWorkoutSpan(
        { '1': start + 45 * MIN, '2': start + 47 * MIN },
        start,
      );
      expect(span).toEqual({ totalMinutes: 47, activeMinutes: 2, hasLongGap: true });
    });

    it('treats a gap exactly at the threshold as active time', () => {
      const span = summarizeWorkoutSpan(
        { '1': start + WORKOUT_LONG_GAP_MINUTES * MIN },
        start,
      );
      expect(span).toEqual({
        totalMinutes: WORKOUT_LONG_GAP_MINUTES,
        activeMinutes: WORKOUT_LONG_GAP_MINUTES,
        hasLongGap: false,
      });
    });

    it('never reports less than one active minute', () => {
      const span = summarizeWorkoutSpan({ '1': start + 10_000 }, start);
      expect(span?.activeMinutes).toBe(1);
    });

    it('walks completions in timestamp order regardless of key order', () => {
      const span = summarizeWorkoutSpan(
        { b: start + 700 * MIN, a: start + 3 * MIN },
        start,
      );
      expect(span).toEqual({ totalMinutes: 700, activeMinutes: 3, hasLongGap: true });
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

  describe('setTypeLetter', () => {
    it('maps the typed picker options to their column letters', () => {
      expect(setTypeLetter('warmup')).toBe('W');
      expect(setTypeLetter('drop')).toBe('D');
      expect(setTypeLetter('failure')).toBe('F');
    });

    it('returns null for numbered (working) sets', () => {
      expect(setTypeLetter('normal')).toBeNull();
      expect(setTypeLetter(null)).toBeNull();
      expect(setTypeLetter(undefined)).toBeNull();
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

  describe('matchesSetRecord', () => {
    const best = { weight: 100, reps: 5 };

    it('is true only for an exact tie, not a beat or a miss', () => {
      expect(matchesSetRecord({ weight: 100, reps: 5 }, best)).toBe(true);
      expect(matchesSetRecord({ weight: 105, reps: 5 }, best)).toBe(false);
      expect(matchesSetRecord({ weight: 100, reps: 6 }, best)).toBe(false);
      expect(matchesSetRecord({ weight: 95, reps: 5 }, best)).toBe(false);
    });

    it('never matches warmups or weightless sets', () => {
      expect(
        matchesSetRecord({ weight: 100, reps: 5, set_type: 'Warm-up Set' }, best),
      ).toBe(false);
      expect(matchesSetRecord({ weight: null, reps: 5 }, best)).toBe(false);
    });

    it('is false without a weighted record to tie', () => {
      expect(matchesSetRecord({ weight: 100, reps: 5 }, null)).toBe(false);
      expect(matchesSetRecord({ weight: 100, reps: 5 }, { weight: null, reps: 5 })).toBe(false);
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

  describe('buildWorkoutCompletionSummary', () => {
    const makeSummarySession = () =>
      ({
        ...makePreset(),
        exercises: [
          {
            id: 'ex-a',
            notes: null,
            exercise_snapshot: { name: 'Bench Press' },
            sets: [
              // Completed working set.
              { id: 101, set_type: 'normal', weight: 100, reps: 5, rpe: 8 },
              // Completed warmup: counts as a set, never volume/top.
              { id: 102, set_type: 'warmup', weight: 60, reps: 5, rpe: 6 },
              // Skipped.
              { id: 103, set_type: 'normal', weight: 100, reps: 5, rpe: null },
            ],
          },
          {
            id: 'ex-b',
            notes: 'felt strong',
            exercise_snapshot: { name: 'Squat' },
            sets: [{ id: 201, set_type: 'drop', weight: 120, reps: 3, rpe: null }],
          },
        ],
      }) as unknown as PresetSession;
    const completed = { '101': 1_000, '102': 2_000, '201': 3_000 };

    it('counts sets, excludes warmups and skipped sets from volume, and averages logged RPE', () => {
      const summary = buildWorkoutCompletionSummary(makeSummarySession(), completed, {});

      expect(summary.totalSetCount).toBe(4);
      expect(summary.completedSetCount).toBe(3);
      expect(summary.skippedSetCount).toBe(1);
      // 100×5 + 120×3 — the drop set counts, the warmup and skipped set do not.
      expect(summary.volumeKg).toBe(860);
      // Only completed sets that logged an RPE: 8 and the warmup's 6.
      expect(summary.averageRpe).toBe(7);
      expect(summary.totalDistanceKm).toBe(0);
    });

    it('accumulates completed-set distance for cardio efforts', () => {
      const session = {
        ...makePreset(),
        exercises: [
          {
            id: 'ex-run',
            notes: null,
            exercise_snapshot: { name: 'Run', modality: 'duration_distance' },
            sets: [
              { id: 301, set_type: 'normal', weight: null, reps: null, duration: 1800, distance: 5.2, rpe: null },
            ],
          },
          {
            id: 'ex-skip',
            notes: null,
            exercise_snapshot: { name: 'Bike', modality: 'duration_distance' },
            // Skipped — its distance must not count.
            sets: [
              { id: 302, set_type: 'normal', weight: null, reps: null, duration: 600, distance: 3, rpe: null },
            ],
          },
        ],
      } as unknown as PresetSession;

      const summary = buildWorkoutCompletionSummary(session, { '301': 1_000 }, {});
      expect(summary.totalDistanceKm).toBe(5.2);
    });

    it('builds per-exercise rows with top completed working set and notes', () => {
      const summary = buildWorkoutCompletionSummary(makeSummarySession(), completed, {});

      const [bench, squat] = summary.exercises;
      expect(bench).toMatchObject({
        entryId: 'ex-a',
        name: 'Bench Press',
        completedSetCount: 2,
        totalSetCount: 3,
        volumeKg: 500,
        topSet: { weightKg: 100, reps: 5 },
        hasPr: false,
      });
      expect(squat).toMatchObject({
        entryId: 'ex-b',
        notes: 'felt strong',
        completedSetCount: 1,
        totalSetCount: 1,
        volumeKg: 360,
        topSet: { weightKg: 120, reps: 3 },
      });
    });

    it('emits one PR row per stamped set and flags the exercise', () => {
      const summary = buildWorkoutCompletionSummary(makeSummarySession(), completed, {
        '101': true,
        '201': true,
      });

      expect(summary.prRows).toEqual([
        { exerciseName: 'Bench Press', weightKg: 100, reps: 5 },
        { exerciseName: 'Squat', weightKg: 120, reps: 3 },
      ]);
      expect(summary.exercises[0].hasPr).toBe(true);
      expect(summary.exercises[1].hasPr).toBe(true);
    });

    it('returns a null average RPE when no completed set logged one', () => {
      const session = makeSummarySession();
      const summary = buildWorkoutCompletionSummary(session, { '201': 3_000 }, {});

      expect(summary.averageRpe).toBeNull();
    });

    it('falls back to the best reps-only set when nothing weighted completed', () => {
      const session = {
        ...makePreset(),
        exercises: [
          {
            id: 'ex-a',
            notes: null,
            exercise_snapshot: { name: 'Pull-up' },
            sets: [
              { id: 301, set_type: 'normal', weight: null, reps: 8, rpe: null },
              { id: 302, set_type: 'normal', weight: null, reps: 12, rpe: null },
            ],
          },
        ],
      } as unknown as PresetSession;

      const summary = buildWorkoutCompletionSummary(
        session,
        { '301': 1_000, '302': 2_000 },
        {},
      );

      expect(summary.volumeKg).toBe(0);
      expect(summary.exercises[0].topSet).toEqual({ weightKg: null, reps: 12 });
    });

    it('surfaces the longest completed duration as the top set on duration exercises', () => {
      const session = {
        ...makePreset(),
        exercises: [
          {
            id: 'ex-a',
            notes: null,
            exercise_snapshot: { name: 'Plank', modality: 'duration' },
            sets: [
              { id: 401, set_type: 'normal', weight: null, reps: null, duration: 45, rpe: null },
              { id: 402, set_type: 'normal', weight: null, reps: null, duration: 60, rpe: null },
              // Legacy reps-as-seconds row counts through the fallback.
              { id: 403, set_type: 'normal', weight: null, reps: 90, duration: null, rpe: null },
              // Warmups never claim the top set.
              { id: 404, set_type: 'warmup', weight: null, reps: null, duration: 120, rpe: null },
            ],
          },
        ],
      } as unknown as PresetSession;

      const summary = buildWorkoutCompletionSummary(
        session,
        { '401': 1_000, '402': 2_000, '403': 3_000, '404': 4_000 },
        {},
      );

      expect(summary.exercises[0].topSet).toEqual({
        weightKg: null,
        reps: null,
        durationSec: 90,
      });
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
                distance: null,
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
            distance: null,
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

      it('passes cardio distance through and nulls junk distance on non-cardio exercises', () => {
        const preset = makeWorkoutPreset({
          exercises: [
            makePresetExercise({
              exercise_name: 'Run',
              category: 'Cardio',
              sets: [
                makePresetSet({
                  reps: null,
                  weight: null,
                  duration: 1500,
                  distance: 5,
                  rest_time: null,
                }),
              ],
            }),
            makePresetExercise({
              id: 802,
              exercise_id: EX_B,
              sets: [makePresetSet({ distance: 3 })],
            }),
          ],
        });

        const payload = buildPresetStartExercisesPayload(preset);

        expect(payload[0].sets[0].distance).toBe(5);
        expect(payload[0].sets[0].rest_time).toBe(0);
        expect(payload[1].sets[0].distance).toBeNull();
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
                distance: null,
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

    describe('formatRecentSessionSet', () => {
      const recentSet = (
        weight: number | null,
        reps: number | null,
        setType: string | null = null,
      ) => ({ setNumber: 1, setType, weight, reps });

      it('formats weight × reps, converting for the display unit', () => {
        expect(formatRecentSessionSet(recentSet(100, 5), 'kg')).toBe('100 × 5');
        expect(formatRecentSessionSet(recentSet(100, 5), 'lbs')).toBe('220.5 × 5');
      });

      it('prefixes warmup sets with W', () => {
        expect(formatRecentSessionSet(recentSet(60, 10, 'warmup'), 'kg')).toBe('W 60 × 10');
      });

      it('handles weight-only and reps-only sets', () => {
        expect(formatRecentSessionSet(recentSet(80, null), 'kg')).toBe('80');
        expect(formatRecentSessionSet(recentSet(null, 12), 'kg')).toBe('12 reps');
      });

      it('formats duration-modality sets as seconds prose', () => {
        expect(
          formatRecentSessionSet(
            { ...recentSet(null, null), duration: 45 },
            'kg',
            'duration',
          ),
        ).toBe('45s');
        expect(
          formatRecentSessionSet(
            { ...recentSet(null, null, 'warmup'), duration: 90 },
            'kg',
            'duration_distance',
          ),
        ).toBe('W 1:30');
      });

      it('shows legacy reps as seconds only for duration modality', () => {
        expect(formatRecentSessionSet(recentSet(null, 45), 'kg', 'duration')).toBe('45s');
        expect(formatRecentSessionSet(recentSet(null, 10), 'kg', 'duration_distance')).toBe(
          '–',
        );
      });

      it('renders a dash for all-null sets and seconds without a modality', () => {
        expect(formatRecentSessionSet(recentSet(null, null), 'kg')).toBe('–');
        expect(
          formatRecentSessionSet({ ...recentSet(null, null), duration: 30 }, 'kg'),
        ).toBe('30s');
      });

      it('appends distance to cardio sets, converting for the display unit', () => {
        expect(
          formatRecentSessionSet(
            { ...recentSet(null, null), duration: 1920, distance: 5.2 },
            'kg',
            'duration_distance',
          ),
        ).toBe('32:00 · 5.2 km');
        expect(
          formatRecentSessionSet(
            { ...recentSet(null, null), duration: 1920, distance: 1.609344 },
            'kg',
            'duration_distance',
            'miles',
          ),
        ).toBe('32:00 · 1 mi');
      });

      it('renders distance-only cardio sets without a dangling separator', () => {
        expect(
          formatRecentSessionSet(
            { ...recentSet(null, null), duration: null, distance: 5 },
            'kg',
            'duration_distance',
          ),
        ).toBe('5 km');
      });

      it('never appends distance on hold (duration) sets', () => {
        expect(
          formatRecentSessionSet(
            { ...recentSet(null, null), duration: 45, distance: 5 },
            'kg',
            'duration',
          ),
        ).toBe('45s');
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

    describe('describeActiveSet', () => {
      const sessionWithSets = makePreset({
        exercises: [
          {
            id: 'entry-1',
            exercise_id: 'ex-1',
            duration_minutes: 20,
            calories_burned: 150,
            entry_date: '2026-03-20',
            notes: null,
            distance: null,
            avg_heart_rate: null,
            source: null,
            superset_group: null,
            exercise_snapshot: {
              id: 'ex-1',
              name: 'Bench Press',
              category: 'Strength',
              calories_per_hour: 400,
              source: 'system',
              images: [],
            },
            activity_details: [],
            sets: [
              {
                id: 101,
                set_number: 1,
                set_type: 'normal',
                reps: 10,
                weight: 60,
                duration: null,
                rest_time: 90,
                notes: null,
                rpe: null,
                completed_at: null,
              },
              {
                id: 102,
                set_number: 2,
                set_type: 'normal',
                reps: 8,
                weight: 70,
                duration: null,
                rest_time: 90,
                notes: null,
                rpe: null,
                completed_at: null,
              },
            ],
          },
          {
            id: 'entry-2',
            exercise_id: 'ex-2',
            duration_minutes: 15,
            calories_burned: 120,
            entry_date: '2026-03-20',
            notes: null,
            distance: null,
            avg_heart_rate: null,
            source: null,
            superset_group: null,
            exercise_snapshot: null,
            activity_details: [],
            sets: [
              {
                id: 201,
                set_number: 1,
                set_type: 'normal',
                reps: null,
                weight: null,
                duration: null,
                rest_time: 120,
                notes: null,
                rpe: null,
                completed_at: null,
              },
            ],
          },
        ] as PresetSession['exercises'],
      });

      it('finds the set across exercises and returns its structured fields', () => {
        expect(describeActiveSet(sessionWithSets, '102')).toEqual({
          exerciseName: 'Bench Press',
          setNumber: 2,
          setCount: 2,
          reps: 8,
          weightKg: 70,
          durationSec: null,
        });
      });

      it('returns a null exerciseName when the exercise has no snapshot', () => {
        expect(describeActiveSet(sessionWithSets, '201')).toEqual({
          exerciseName: null,
          setNumber: 1,
          setCount: 1,
          reps: null,
          weightKg: null,
          durationSec: null,
        });
      });

      it('returns null for a null session, null setId, or an unknown setId', () => {
        expect(describeActiveSet(null, '101')).toBeNull();
        expect(describeActiveSet(sessionWithSets, null)).toBeNull();
        expect(describeActiveSet(sessionWithSets, '999')).toBeNull();
      });

      it('describes a duration-modality set by its effective seconds', () => {
        const durationSession = makePreset({
          exercises: [
            {
              ...sessionWithSets.exercises[0],
              exercise_snapshot: {
                ...sessionWithSets.exercises[0].exercise_snapshot,
                modality: 'duration',
              },
              sets: [
                {
                  ...sessionWithSets.exercises[0].sets[0],
                  id: 301,
                  reps: 45,
                  weight: null,
                  duration: null,
                },
              ],
            },
          ] as PresetSession['exercises'],
        });
        expect(describeActiveSet(durationSession, '301')).toEqual({
          exerciseName: 'Bench Press',
          setNumber: 1,
          setCount: 1,
          // Legacy isometric seconds surface as duration, never as a rep target.
          reps: null,
          weightKg: null,
          durationSec: 45,
        });
      });

      describe('describeActiveSetAssumed', () => {
        it('backfills empty weight/reps from the assumed resolution', () => {
          // Set 201 has no values and its exercise (ex-2) has previous
          // history — the description assumes last session's counterpart.
          const previous = {
            'ex-2': [{ setNumber: 1, setType: 'normal', weight: 45, reps: 12 }],
          };
          expect(describeActiveSetAssumed(sessionWithSets, '201', previous, {})).toEqual({
            exerciseName: null,
            setNumber: 1,
            setCount: 1,
            reps: 12,
            weightKg: 45,
            durationSec: null,
          });
        });

        it('leaves a fully-entered set untouched and passes null descriptions through', () => {
          const previous = {
            'ex-1': [
              { setNumber: 1, setType: 'normal', weight: 45, reps: 12 },
              { setNumber: 2, setType: 'normal', weight: 45, reps: 12 },
            ],
          };
          expect(describeActiveSetAssumed(sessionWithSets, '102', previous, {})).toEqual(
            describeActiveSet(sessionWithSets, '102'),
          );
          expect(describeActiveSetAssumed(null, '101', {}, {})).toBeNull();
        });
      });
    });

    describe('resolveAssumedSetValues', () => {
      const makeSet = (
        id: number,
        overrides?: Partial<{ set_type: string | null; weight: number | null; reps: number | null }>,
      ) => ({ id, set_type: 'normal', weight: null, reps: null, ...overrides });
      const prev = (weight: number | null, reps: number | null, setType = 'normal') => ({
        setNumber: 1,
        setType,
        weight,
        reps,
      });

      it('assumes each set from its same-position previous-session set', () => {
        const result = resolveAssumedSetValues(
          [makeSet(1), makeSet(2), makeSet(3)],
          [prev(100, 8), prev(100, 6), prev(95, 6)],
        );
        expect(result).toEqual([
          { weight: 100, reps: 8, duration: null, distance: null },
          { weight: 100, reps: 6, duration: null, distance: null },
          { weight: 95, reps: 6, duration: null, distance: null },
        ]);
      });

      it('keeps sets with history pinned to their own previous values, whatever is typed above', () => {
        // Hevy-exact: typing 105 into set 1 must not drag sets 2–3 off last
        // session's 100/95 — the progression reproduces set-for-set.
        const result = resolveAssumedSetValues(
          [makeSet(1, { weight: 105 }), makeSet(2), makeSet(3)],
          [prev(110, 8), prev(100, 6), prev(95, 6)],
        );
        expect(result[1]).toEqual({ weight: 100, reps: 6, duration: null, distance: null });
        expect(result[2]).toEqual({ weight: 95, reps: 6, duration: null, distance: null });
      });

      it('mirrors the rows above onto sets with no history of their own', () => {
        // A never-done exercise: typing into set 1 updates every empty row
        // below it at once.
        const typed = resolveAssumedSetValues(
          [makeSet(1, { weight: 100, reps: 8 }), makeSet(2), makeSet(3)],
          undefined,
        );
        expect(typed[1]).toEqual({ weight: 100, reps: 8, duration: null, distance: null });
        expect(typed[2]).toEqual({ weight: 100, reps: 8, duration: null, distance: null });

        // A set added beyond last time's count mirrors the row above's
        // resolved placeholder.
        const added = resolveAssumedSetValues([makeSet(1), makeSet(2)], [prev(100, 8)]);
        expect(added[1]).toEqual({ weight: 100, reps: 8, duration: null, distance: null });
      });

      it('falls back to the planned value when there is no history or session entry', () => {
        const result = resolveAssumedSetValues([makeSet(1), makeSet(2)], undefined, {
          '2': { weight: 80, reps: 5 },
        });
        expect(result[0]).toEqual({ weight: null, reps: null, duration: null, distance: null });
        expect(result[1]).toEqual({ weight: 80, reps: 5, duration: null, distance: null });
      });

      it('prefers history over the plan, and both over typed entries above', () => {
        const planned = { '1': { weight: 80, reps: 5 }, '2': { weight: 80, reps: 5 } };
        const withHistory = resolveAssumedSetValues(
          [makeSet(1), makeSet(2)],
          [prev(100, 8), prev(100, 8)],
          planned,
        );
        expect(withHistory[1]).toEqual({ weight: 100, reps: 8, duration: null, distance: null });

        const withEntry = resolveAssumedSetValues(
          [makeSet(1, { weight: 110, reps: 3 }), makeSet(2)],
          [prev(100, 8), prev(100, 8)],
          planned,
        );
        expect(withEntry[1]).toEqual({ weight: 100, reps: 8, duration: null, distance: null });
      });

      it('keeps warmup and working mirrors separate', () => {
        // A typed warmup must not become the assumption for working sets that
        // have nothing of their own.
        const result = resolveAssumedSetValues(
          [makeSet(1, { set_type: 'warmup', weight: 60, reps: 10 }), makeSet(2), makeSet(3)],
          undefined,
        );
        expect(result[1]).toEqual({ weight: null, reps: null, duration: null, distance: null });
        expect(result[2]).toEqual({ weight: null, reps: null, duration: null, distance: null });

        // And a working entry doesn't retarget a later warmup row.
        const warmupAfter = resolveAssumedSetValues(
          [makeSet(1, { weight: 100, reps: 5 }), makeSet(2, { set_type: 'warmup' })],
          undefined,
        );
        expect(warmupAfter[1]).toEqual({ weight: null, reps: null, duration: null, distance: null });
      });

      it('resolves nothing for a brand-new exercise with no sources', () => {
        expect(resolveAssumedSetValues([makeSet(1), makeSet(2)], undefined)).toEqual([
          { weight: null, reps: null, duration: null, distance: null },
          { weight: null, reps: null, duration: null, distance: null },
        ]);
      });

      it('cascades duration through the same previous → planned → preceding chain', () => {
        const withPrev = resolveAssumedSetValues(
          [
            { id: 1, set_type: 'normal', weight: null, reps: null, duration: null },
            { id: 2, set_type: 'normal', weight: null, reps: null, duration: null },
          ],
          [{ setNumber: 1, setType: 'normal', weight: null, reps: null, duration: 45 }],
        );
        expect(withPrev[0].duration).toBe(45);
        // Set 2 has no previous counterpart — it mirrors the row above.
        expect(withPrev[1].duration).toBe(45);

        const withPlanned = resolveAssumedSetValues(
          [{ id: 1, set_type: 'normal', weight: null, reps: null, duration: null }],
          undefined,
          { '1': { weight: null, reps: null, duration: 60 } },
        );
        expect(withPlanned[0].duration).toBe(60);

        // Rehydrated v5 planned entries lack the duration key entirely.
        const legacyPlanned = resolveAssumedSetValues(
          [{ id: 1, set_type: 'normal', weight: null, reps: null, duration: null }],
          undefined,
          { '1': { weight: 80, reps: 5 } },
        );
        expect(legacyPlanned[0]).toEqual({ weight: 80, reps: 5, duration: null, distance: null });
      });

      it('cascades cardio distance alongside duration', () => {
        const withPrev = resolveAssumedSetValues(
          [
            { id: 1, set_type: 'normal', weight: null, reps: null, duration: null, distance: null },
            { id: 2, set_type: 'normal', weight: null, reps: null, duration: null, distance: null },
          ],
          [
            {
              setNumber: 1,
              setType: 'normal',
              weight: null,
              reps: null,
              duration: 1500,
              distance: 5,
            },
          ],
        );
        expect(withPrev[0].distance).toBe(5);
        expect(withPrev[1].distance).toBe(5);

        const withPlanned = resolveAssumedSetValues(
          [{ id: 1, set_type: 'normal', weight: null, reps: null, duration: null, distance: null }],
          undefined,
          { '1': { weight: null, reps: null, duration: 1500, distance: 5 } },
        );
        expect(withPlanned[0].distance).toBe(5);
      });
    });

    describe('extractPlannedSetValues / stripPlannedSetValues', () => {
      const exercises = buildPresetStartExercisesPayload({
        id: 1,
        name: 'Push Day',
        exercises: [
          {
            id: 10,
            exercise_id: '11111111-1111-4111-8111-111111111111',
            exercise_name: 'Bench Press',
            sets: [
              { id: 1, set_number: 1, weight: 80, reps: 5, rest_time: 120 },
              { id: 2, set_number: 2, weight: 80, reps: 5, rest_time: 120 },
            ],
          },
        ],
      } as unknown as WorkoutPreset);

      it('captures the plan positionally and strips it from the create payload', () => {
        expect(extractPlannedSetValues(exercises)).toEqual([
          [
            { weight: 80, reps: 5, duration: null, distance: null },
            { weight: 80, reps: 5, duration: null, distance: null },
          ],
        ]);
        const stripped = stripPlannedSetValues(exercises);
        expect(stripped[0].sets.map((s) => [s.weight, s.reps])).toEqual([
          [null, null],
          [null, null],
        ]);
        // Structure survives the strip.
        expect(stripped[0].sets.map((s) => s.rest_time)).toEqual([120, 120]);
        // The source payload is not mutated.
        expect(exercises[0].sets[0].weight).toBe(80);
      });

      it('strips duration for every modality, including stray values on strength sets', () => {
        const timed = [
          {
            exercise_id: '11111111-1111-4111-8111-111111111111',
            sort_order: 0,
            duration_minutes: 0,
            notes: null,
            // A stray duration on a weight_reps preset set must not reach the
            // created session: it would count as a historical set in the
            // exercise-stats query and render as a bare time in the PREVIOUS
            // column.
            sets: [{ set_number: 1, weight: 60, reps: 5, duration: 90 }],
          },
          {
            exercise_id: '22222222-2222-4222-8222-222222222222',
            sort_order: 1,
            duration_minutes: 0,
            notes: null,
            sets: [{ set_number: 1, weight: null, reps: null, duration: 45 }],
          },
        ];
        const stripped = stripPlannedSetValues(timed);
        expect(stripped[0].sets[0].duration).toBeNull();
        expect(stripped[0].sets[0].weight).toBeNull();
        expect(stripped[1].sets[0].duration).toBeNull();
      });

      it('captures and strips cardio distance alongside duration', () => {
        const cardio = buildPresetStartExercisesPayload({
          id: 2,
          name: 'Cardio Day',
          exercises: [
            {
              id: 20,
              exercise_id: '33333333-3333-4333-8333-333333333333',
              exercise_name: 'Run',
              category: 'Cardio',
              sets: [{ id: 1, set_number: 1, duration: 1500, distance: 5 }],
            },
          ],
        } as any);
        expect(extractPlannedSetValues(cardio)).toEqual([
          [{ weight: null, reps: null, duration: 1500, distance: 5 }],
        ]);
        const stripped = stripPlannedSetValues(cardio);
        expect(stripped[0].sets[0].duration).toBeNull();
        expect(stripped[0].sets[0].distance).toBeNull();
      });
    });

    describe('formatSetLoad', () => {
      it('formats weight × reps with the display unit, converting for lbs', () => {
        expect(formatSetLoad({ weightKg: 60, reps: 8 }, 'kg')).toBe('60 kg × 8');
        expect(formatSetLoad({ weightKg: 60, reps: 8 }, 'lbs')).toBe('132.3 lbs × 8');
      });

      it('handles reps-only and weight-only sets', () => {
        expect(formatSetLoad({ weightKg: null, reps: 12 }, 'kg')).toBe('12 reps');
        expect(formatSetLoad({ weightKg: 80, reps: null }, 'kg')).toBe('80 kg');
      });

      it('returns null when the set has neither weight nor reps', () => {
        expect(formatSetLoad({ weightKg: null, reps: null }, 'kg')).toBeNull();
      });

      it('prefers a duration over weight/reps text', () => {
        expect(formatSetLoad({ weightKg: null, reps: null, durationSec: 45 }, 'kg')).toBe(
          '45s',
        );
        expect(formatSetLoad({ weightKg: 60, reps: 8, durationSec: 90 }, 'kg')).toBe(
          '1:30',
        );
      });
    });

    describe('modality helpers', () => {
      describe('resolveSnapshotModality', () => {
        it('prefers a valid explicit modality over the category', () => {
          expect(
            resolveSnapshotModality({ modality: 'duration', category: 'strength' }),
          ).toBe('duration');
        });

        it('derives from category when modality is absent or invalid', () => {
          expect(resolveSnapshotModality({ category: 'Cardio' })).toBe(
            'duration_distance',
          );
          expect(
            resolveSnapshotModality({ modality: 'garbage', category: 'isometric' }),
          ).toBe('duration');
          expect(resolveSnapshotModality(null)).toBe('weight_reps');
          expect(resolveSnapshotModality({ category: null })).toBe('weight_reps');
        });
      });

      it('isDurationModality covers the two duration-like values only', () => {
        expect(isDurationModality('duration')).toBe(true);
        expect(isDurationModality('duration_distance')).toBe(true);
        expect(isDurationModality('weight_reps')).toBe(false);
        expect(isDurationModality('reps_only')).toBe(false);
      });

      describe('effectiveSetDurationSec', () => {
        it('prefers the stored duration', () => {
          expect(effectiveSetDurationSec({ duration: 30, reps: 45 }, 'duration')).toBe(30);
        });

        it('falls back to legacy reps-as-seconds for duration modality only', () => {
          expect(effectiveSetDurationSec({ duration: null, reps: 45 }, 'duration')).toBe(45);
          // Backfilled cardio presets carry seeded reps that must NOT render
          // as seconds.
          expect(
            effectiveSetDurationSec({ duration: null, reps: 10 }, 'duration_distance'),
          ).toBeNull();
          expect(effectiveSetDurationSec({ duration: null, reps: 45 }, 'weight_reps')).toBeNull();
        });

        it('returns null when nothing is available', () => {
          expect(effectiveSetDurationSec({ duration: null, reps: null }, 'duration')).toBeNull();
        });
      });

      it('formatDurationSeconds renders 45s under a minute and m:ss above', () => {
        expect(formatDurationSeconds(45)).toBe('45s');
        expect(formatDurationSeconds(60)).toBe('1:00');
        expect(formatDurationSeconds(90)).toBe('1:30');
        expect(formatDurationSeconds(605)).toBe('10:05');
      });

      describe('buildActivitySetsPayload', () => {
        const originals = new Map([
          [
            'set-0',
            {
              id: 7,
              set_number: 1,
              set_type: 'Working Set',
              reps: 45,
              weight: null,
              duration: 60,
              rest_time: 30,
              notes: 'hold',
              rpe: 8,
              completed_at: null,
              is_pr: false,
            },
          ],
        ]);

        it('rides original fields along and takes weight/reps from the drafts', () => {
          const payload = buildActivitySetsPayload(
            [{ clientId: 'set-0', weight: '50', reps: '5' }],
            originals,
            'kg',
            'weight_reps',
          );
          expect(payload[0]).toMatchObject({
            id: 7,
            set_number: 1,
            weight: 50,
            reps: 5,
            duration: 60,
            rest_time: 30,
            notes: 'hold',
            rpe: 8,
          });
        });

        it('takes duration from the drafts on duration-modality exercises', () => {
          const payload = buildActivitySetsPayload(
            [{ clientId: 'set-0', weight: '', reps: '45', duration: 75 }],
            originals,
            'kg',
            'duration',
          );
          expect(payload[0].duration).toBe(75);
          // Legacy reps ride along untouched — no silent migration.
          expect(payload[0].reps).toBe(45);
        });

        it('clears a duration the user emptied on duration exercises', () => {
          const payload = buildActivitySetsPayload(
            [{ clientId: 'set-0', weight: '', reps: '', duration: null }],
            originals,
            'kg',
            'duration_distance',
          );
          expect(payload[0].duration).toBeNull();
        });

        it('defaults new sets with no original', () => {
          const payload = buildActivitySetsPayload(
            [{ clientId: 'set-9', weight: '', reps: '', duration: 30 }],
            originals,
            'kg',
            'duration',
          );
          expect(payload[0]).toMatchObject({
            set_type: 'Working Set',
            set_number: 1,
            weight: null,
            reps: null,
            duration: 30,
          });
          expect(payload[0].id).toBeUndefined();
        });

        it('rides original distance along on the multi-set fallback', () => {
          const cardioOriginals = new Map([
            [
              'set-0',
              {
                id: 7,
                set_number: 1,
                set_type: 'Working Set',
                reps: null,
                weight: null,
                duration: 900,
                distance: 2.5,
                rest_time: 0,
                notes: null,
                rpe: null,
                completed_at: null,
                is_pr: false,
              },
            ],
          ]);
          const payload = buildActivitySetsPayload(
            [{ clientId: 'set-0', weight: '', reps: '', duration: 950 }],
            cardioOriginals,
            'kg',
            'duration_distance',
          );
          expect(payload[0].distance).toBe(2.5);
          expect(payload[0].duration).toBe(950);
        });

        it('builds the single set from the cardio form values', () => {
          const payload = buildActivitySetsPayload(
            [{ clientId: 'set-0', weight: '', reps: '' }],
            originals,
            'kg',
            'duration_distance',
            { durationSec: 1800, distanceKm: 5.2 },
          );
          expect(payload).toHaveLength(1);
          expect(payload[0]).toMatchObject({
            id: 7,
            set_number: 1,
            duration: 1800,
            distance: 5.2,
            rest_time: 0,
          });
        });

        it('fabricates one cardio set for a legacy set-less entry', () => {
          const payload = buildActivitySetsPayload(
            [],
            new Map(),
            'kg',
            'duration_distance',
            { durationSec: 1800, distanceKm: 5.2 },
          );
          expect(payload).toEqual([
            {
              set_number: 1,
              set_type: 'Working Set',
              weight: null,
              reps: null,
              duration: 1800,
              distance: 5.2,
              rest_time: 0,
            },
          ]);
        });
      });
    });

    describe('normalizeWeightUnit', () => {
      it('maps kg to kg and everything else to lbs', () => {
        expect(normalizeWeightUnit('kg')).toBe('kg');
        expect(normalizeWeightUnit('lbs')).toBe('lbs');
        expect(normalizeWeightUnit('st_lbs')).toBe('lbs');
      });

      it('defaults a missing preference to kg', () => {
        expect(normalizeWeightUnit(undefined)).toBe('kg');
      });
    });

    describe('formatRestCountdown', () => {
      it('formats M:SS, rounding partial seconds up', () => {
        expect(formatRestCountdown(0)).toBe('0:00');
        expect(formatRestCountdown(1_000)).toBe('0:01');
        expect(formatRestCountdown(59_001)).toBe('1:00');
        expect(formatRestCountdown(65_500)).toBe('1:06');
        expect(formatRestCountdown(90_000)).toBe('1:30');
      });

      it('clamps negative remaining time to zero', () => {
        expect(formatRestCountdown(-5_000)).toBe('0:00');
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

  describe('exerciseFromExternalItem', () => {
    it('maps a full online search item onto an Exercise for preview', () => {
      const exercise = exerciseFromExternalItem({
        id: '123',
        name: 'Wger Squat',
        category: 'Legs',
        calories_per_hour: 250,
        source: 'wger',
        description: 'Stand with the bar on your back.',
        force: 'push',
        level: 'intermediate',
        mechanic: 'compound',
        equipment: ['barbell'],
        primary_muscles: ['quadriceps'],
        secondary_muscles: ['glutes'],
        instructions: ['Stand with the bar on your back.', 'Squat down.'],
        images: ['https://wger.de/media/squat.png'],
      });
      expect(exercise).toMatchObject({
        id: '123',
        name: 'Wger Squat',
        category: 'Legs',
        calories_per_hour: 250,
        source: 'wger',
        description: 'Stand with the bar on your back.',
        force: 'push',
        level: 'intermediate',
        mechanic: 'compound',
        equipment: ['barbell'],
        primary_muscles: ['quadriceps'],
        secondary_muscles: ['glutes'],
        instructions: ['Stand with the bar on your back.', 'Squat down.'],
        images: ['https://wger.de/media/squat.png'],
      });
    });

    it('defaults the sparse nutritionix shape, coercing null calories to 0', () => {
      const exercise = exerciseFromExternalItem({
        id: 'nx-1',
        name: 'Running',
        category: 'External',
        calories_per_hour: null,
        source: 'nutritionix',
      });
      expect(exercise).toMatchObject({
        id: 'nx-1',
        name: 'Running',
        category: 'External',
        calories_per_hour: 0,
        source: 'nutritionix',
        equipment: [],
        primary_muscles: [],
        secondary_muscles: [],
        images: [],
        force: null,
        level: null,
        mechanic: null,
      });
      expect(exercise.instructions).toBeUndefined();
      expect(exercise.description).toBeUndefined();
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

  describe('buildPresetUpdateExercises', () => {
    const EX_A = '11111111-1111-4111-8111-111111111111';
    const EX_B = '22222222-2222-4222-8222-222222222222';

    type SessionExercise = PresetSession['exercises'][number];
    type SessionSet = SessionExercise['sets'][number];

    const strengthSnapshot = {
      id: EX_A,
      name: 'Bench Press',
      category: 'Strength',
      calories_per_hour: 400,
      source: 'system',
      images: [],
    } as any;

    const makeSessionSet = (overrides?: Partial<SessionSet>): SessionSet =>
      ({
        id: 101,
        set_number: 1,
        set_type: 'normal',
        reps: 5,
        weight: 100,
        duration: null,
        rest_time: 90,
        notes: null,
        rpe: null,
        completed_at: null,
        is_pr: false,
        ...overrides,
      }) as SessionSet;

    const makeSessionExercise = (overrides?: Partial<SessionExercise>): SessionExercise =>
      ({
        id: 'entry-1',
        exercise_id: EX_A,
        duration_minutes: 20,
        calories_burned: 0,
        entry_date: '2026-07-15',
        notes: null,
        distance: null,
        avg_heart_rate: null,
        source: null,
        superset_group: null,
        exercise_snapshot: strengthSnapshot,
        activity_details: [],
        sets: [makeSessionSet()],
        ...overrides,
      }) as SessionExercise;

    const makeTargetPresetSet = (overrides?: Partial<WorkoutPresetSet>): WorkoutPresetSet => ({
      id: 901,
      set_number: 1,
      set_type: 'normal',
      reps: 5,
      weight: 100,
      duration: null,
      rest_time: 90,
      notes: null,
      ...overrides,
    });

    const makeTargetPresetExercise = (
      overrides?: Partial<WorkoutPresetExercise>,
    ): WorkoutPresetExercise => ({
      id: 801,
      exercise_id: EX_A,
      image_url: null,
      exercise_name: 'Bench Press',
      category: 'Strength',
      superset_group: null,
      sets: [makeTargetPresetSet()],
      ...overrides,
    });

    const makeTargetPreset = (overrides?: Partial<WorkoutPreset>): WorkoutPreset => ({
      id: 42,
      user_id: 'user-1',
      name: 'Push Day',
      description: null,
      is_public: false,
      exercises: [makeTargetPresetExercise()],
      ...overrides,
    });

    /** Opts marking every session set completed, with no live-start plan. */
    const allCompleted = (session: PresetSession) => {
      const completedSetIds: Record<string, number> = {};
      session.exercises.forEach((e) =>
        e.sets.forEach((s) => {
          completedSetIds[String(s.id)] = 1;
        }),
      );
      return { completedSetIds, plannedSetValues: {} };
    };

    it('returns null when the performed session matches the preset', () => {
      const session = makePreset({ exercises: [makeSessionExercise()] });
      expect(
        buildPresetUpdateExercises(session, makeTargetPreset(), allCompleted(session)),
      ).toBeNull();
    });

    it('returns the full payload when a completed set value changed', () => {
      const session = makePreset({
        exercises: [makeSessionExercise({ sets: [makeSessionSet({ weight: 105 })] })],
      });
      const payload = buildPresetUpdateExercises(
        session,
        makeTargetPreset(),
        allCompleted(session),
      );
      expect(payload).toEqual([
        {
          exercise_id: EX_A,
          image_url: null,
          sort_order: 0,
          superset_group: null,
          sets: [
            {
              set_number: 1,
              set_type: 'normal',
              reps: 5,
              weight: 105,
              duration: null,
              distance: null,
              rest_time: 90,
              notes: null,
            },
          ],
        },
      ]);
    });

    it('emits exercises that parse under the preset request schema', () => {
      const session = makePreset({
        exercises: [makeSessionExercise({ sets: [makeSessionSet({ weight: 105 })] })],
      });
      const payload = buildPresetUpdateExercises(
        session,
        makeTargetPreset(),
        allCompleted(session),
      )!;
      for (const exercise of payload) {
        expect(() => workoutPresetExerciseRequestSchema.parse(exercise)).not.toThrow();
      }
    });

    it('flags an added set and renumbers sequentially', () => {
      const session = makePreset({
        exercises: [
          makeSessionExercise({
            sets: [makeSessionSet(), makeSessionSet({ id: 102, set_number: 2, weight: 90 })],
          }),
        ],
      });
      const payload = buildPresetUpdateExercises(
        session,
        makeTargetPreset(),
        allCompleted(session),
      );
      expect(payload![0].sets.map((s) => s.set_number)).toEqual([1, 2]);
      expect(payload![0].sets[1].weight).toBe(90);
    });

    it('flags a removed set', () => {
      const preset = makeTargetPreset({
        exercises: [
          makeTargetPresetExercise({
            sets: [makeTargetPresetSet(), makeTargetPresetSet({ id: 902, set_number: 2 })],
          }),
        ],
      });
      const session = makePreset({ exercises: [makeSessionExercise()] });
      const payload = buildPresetUpdateExercises(session, preset, allCompleted(session));
      expect(payload![0].sets).toHaveLength(1);
    });

    it('flags an added exercise and takes its image from the snapshot', () => {
      const session = makePreset({
        exercises: [
          makeSessionExercise(),
          makeSessionExercise({
            id: 'entry-2',
            exercise_id: EX_B,
            exercise_snapshot: { ...strengthSnapshot, id: EX_B, name: 'Row', images: ['row.jpg'] },
            sets: [makeSessionSet({ id: 201 })],
          }),
        ],
      });
      const payload = buildPresetUpdateExercises(
        session,
        makeTargetPreset(),
        allCompleted(session),
      );
      expect(payload).toHaveLength(2);
      expect(payload![1]).toEqual(
        expect.objectContaining({ exercise_id: EX_B, sort_order: 1, image_url: 'row.jpg' }),
      );
    });

    it('flags a removed exercise', () => {
      const preset = makeTargetPreset({
        exercises: [
          makeTargetPresetExercise(),
          makeTargetPresetExercise({ id: 802, exercise_id: EX_B, exercise_name: 'Row' }),
        ],
      });
      const session = makePreset({ exercises: [makeSessionExercise()] });
      const payload = buildPresetUpdateExercises(session, preset, allCompleted(session));
      expect(payload).toHaveLength(1);
      expect(payload![0].exercise_id).toBe(EX_A);
    });

    it('flags an exercise reorder and emits the session order', () => {
      const preset = makeTargetPreset({
        exercises: [
          makeTargetPresetExercise(),
          makeTargetPresetExercise({ id: 802, exercise_id: EX_B, exercise_name: 'Row' }),
        ],
      });
      const session = makePreset({
        exercises: [
          makeSessionExercise({
            id: 'entry-2',
            exercise_id: EX_B,
            exercise_snapshot: { ...strengthSnapshot, id: EX_B, name: 'Row' },
            sets: [makeSessionSet({ id: 201 })],
          }),
          makeSessionExercise(),
        ],
      });
      const payload = buildPresetUpdateExercises(session, preset, allCompleted(session));
      expect(payload!.map((e) => e.exercise_id)).toEqual([EX_B, EX_A]);
    });

    it('flags a superset regrouping', () => {
      const session = makePreset({
        exercises: [makeSessionExercise({ superset_group: 1 })],
      });
      const payload = buildPresetUpdateExercises(
        session,
        makeTargetPreset(),
        allCompleted(session),
      );
      expect(payload![0].superset_group).toBe(1);
    });

    it('keeps the preset image for matched exercises so image churn is not a deviation', () => {
      const session = makePreset({
        exercises: [
          makeSessionExercise({
            exercise_snapshot: { ...strengthSnapshot, images: ['fresh.jpg'] },
          }),
        ],
      });
      const preset = makeTargetPreset({
        exercises: [makeTargetPresetExercise({ image_url: 'preset.jpg' })],
      });
      expect(buildPresetUpdateExercises(session, preset, allCompleted(session))).toBeNull();
    });

    it('backfills weight/reps for a skipped set from its planned values', () => {
      const session = makePreset({
        exercises: [
          makeSessionExercise({
            sets: [
              makeSessionSet({ weight: 105 }),
              makeSessionSet({ id: 102, set_number: 2, weight: null, reps: null }),
            ],
          }),
        ],
      });
      const preset = makeTargetPreset({
        exercises: [
          makeTargetPresetExercise({
            sets: [makeTargetPresetSet(), makeTargetPresetSet({ id: 902, set_number: 2 })],
          }),
        ],
      });
      const payload = buildPresetUpdateExercises(session, preset, {
        completedSetIds: { '101': 1 },
        plannedSetValues: { '102': { weight: 100, reps: 5, duration: null } },
      });
      expect(payload![0].sets[1]).toEqual(expect.objectContaining({ weight: 100, reps: 5 }));
    });

    it('returns null when the only open question is a skipped set still matching its plan', () => {
      const session = makePreset({
        exercises: [makeSessionExercise({ sets: [makeSessionSet({ weight: null, reps: null })] })],
      });
      expect(
        buildPresetUpdateExercises(session, makeTargetPreset(), {
          completedSetIds: {},
          plannedSetValues: { '101': { weight: 100, reps: 5, duration: null } },
        }),
      ).toBeNull();
    });

    it('keys backfill by set id so a mid-workout deletion cannot shift it', () => {
      const session = makePreset({
        exercises: [
          makeSessionExercise({
            sets: [
              makeSessionSet({ weight: 105 }),
              // Set 102 was deleted mid-workout; 103 stays skipped.
              makeSessionSet({ id: 103, set_number: 2, weight: null, reps: null }),
            ],
          }),
        ],
      });
      const payload = buildPresetUpdateExercises(session, makeTargetPreset(), {
        completedSetIds: { '101': 1 },
        plannedSetValues: {
          '102': { weight: 80, reps: 12, duration: null },
          '103': { weight: 100, reps: 5, duration: null },
        },
      });
      expect(payload![0].sets[1]).toEqual(expect.objectContaining({ weight: 100, reps: 5 }));
    });

    it('treats an explicitly cleared note on a completed set as a deviation, not a resurrection', () => {
      const session = makePreset({ exercises: [makeSessionExercise()] });
      const preset = makeTargetPreset({
        exercises: [
          makeTargetPresetExercise({ sets: [makeTargetPresetSet({ notes: 'slow tempo' })] }),
        ],
      });
      const payload = buildPresetUpdateExercises(session, preset, allCompleted(session));
      expect(payload).not.toBeNull();
      expect(payload![0].sets[0].notes).toBeNull();
    });

    it('nulls duration on non-duration modalities so leaked values are not deviations', () => {
      // Junk duration on BOTH sides of a weights exercise (the known leak
      // class) must cancel out rather than prompt or reach the payload.
      const session = makePreset({
        exercises: [makeSessionExercise({ sets: [makeSessionSet({ duration: 90 })] })],
      });
      const preset = makeTargetPreset({
        exercises: [makeTargetPresetExercise({ sets: [makeTargetPresetSet({ duration: 45 })] })],
      });
      expect(buildPresetUpdateExercises(session, preset, allCompleted(session))).toBeNull();
    });

    it('keeps duration on duration-modality exercises and detects a changed hold', () => {
      const plankSnapshot = { ...strengthSnapshot, name: 'Plank', modality: 'duration' };
      const session = makePreset({
        exercises: [
          makeSessionExercise({
            exercise_snapshot: plankSnapshot,
            sets: [makeSessionSet({ reps: null, weight: null, duration: 75 })],
          }),
        ],
      });
      const preset = makeTargetPreset({
        exercises: [
          makeTargetPresetExercise({
            sets: [makeTargetPresetSet({ reps: null, weight: null, duration: 60 })],
          }),
        ],
      });
      const payload = buildPresetUpdateExercises(session, preset, allCompleted(session));
      expect(payload![0].sets[0].duration).toBe(75);
    });

    it('coerces cardio rest to 0 on both sides so preset-null vs live-0 is not a deviation', () => {
      const runSnapshot = {
        ...strengthSnapshot,
        name: 'Run',
        category: 'Cardio',
        modality: 'duration_distance',
      };
      const session = makePreset({
        exercises: [
          makeSessionExercise({
            exercise_snapshot: runSnapshot,
            sets: [makeSessionSet({ reps: null, weight: null, duration: 1500, rest_time: 0 })],
          }),
        ],
      });
      const preset = makeTargetPreset({
        exercises: [
          makeTargetPresetExercise({
            sets: [
              makeTargetPresetSet({ reps: null, weight: null, duration: 1500, rest_time: null }),
            ],
          }),
        ],
      });
      expect(buildPresetUpdateExercises(session, preset, allCompleted(session))).toBeNull();
    });

    it('detects a cardio distance change and carries it into the payload', () => {
      const runSnapshot = {
        ...strengthSnapshot,
        name: 'Run',
        category: 'Cardio',
        modality: 'duration_distance',
      };
      const session = makePreset({
        exercises: [
          makeSessionExercise({
            exercise_snapshot: runSnapshot,
            sets: [
              makeSessionSet({
                reps: null,
                weight: null,
                duration: 1500,
                distance: 6,
                rest_time: 0,
              }),
            ],
          }),
        ],
      });
      const preset = makeTargetPreset({
        exercises: [
          makeTargetPresetExercise({
            sets: [
              makeTargetPresetSet({
                reps: null,
                weight: null,
                duration: 1500,
                distance: 5,
                rest_time: null,
              }),
            ],
          }),
        ],
      });
      const payload = buildPresetUpdateExercises(session, preset, allCompleted(session));
      expect(payload![0].sets[0].distance).toBe(6);
    });

    it('returns null when a skipped cardio set still matches its planned duration and distance', () => {
      const runSnapshot = {
        ...strengthSnapshot,
        name: 'Run',
        category: 'Cardio',
        modality: 'duration_distance',
      };
      const session = makePreset({
        exercises: [
          makeSessionExercise({
            exercise_snapshot: runSnapshot,
            sets: [
              makeSessionSet({
                reps: null,
                weight: null,
                duration: null,
                distance: null,
                rest_time: 0,
              }),
            ],
          }),
        ],
      });
      const preset = makeTargetPreset({
        exercises: [
          makeTargetPresetExercise({
            sets: [
              makeTargetPresetSet({
                reps: null,
                weight: null,
                duration: 1500,
                distance: 5,
                rest_time: null,
              }),
            ],
          }),
        ],
      });
      expect(
        buildPresetUpdateExercises(session, preset, {
          completedSetIds: {},
          plannedSetValues: {
            '101': { weight: null, reps: null, duration: 1500, distance: 5 },
          },
        }),
      ).toBeNull();
    });

    it('nulls distance on non-cardio modalities so junk values are not deviations', () => {
      const session = makePreset({
        exercises: [makeSessionExercise({ sets: [makeSessionSet({ distance: 3 })] })],
      });
      const preset = makeTargetPreset({
        exercises: [makeTargetPresetExercise({ sets: [makeTargetPresetSet({ distance: 7 })] })],
      });
      expect(buildPresetUpdateExercises(session, preset, allCompleted(session))).toBeNull();
    });

    it('canonicalizes an untouched fabricated set back to a zero-set preset exercise', () => {
      const session = makePreset({
        exercises: [
          makeSessionExercise({
            sets: [makeSessionSet({ weight: null, reps: null, rest_time: DEFAULT_REST_SEC })],
          }),
        ],
      });
      const preset = makeTargetPreset({ exercises: [makeTargetPresetExercise({ sets: [] })] });
      expect(
        buildPresetUpdateExercises(session, preset, {
          completedSetIds: {},
          plannedSetValues: {},
        }),
      ).toBeNull();
    });

    it('writes the fabricated set into a zero-set preset exercise once it was actually used', () => {
      const session = makePreset({
        exercises: [makeSessionExercise({ sets: [makeSessionSet({ weight: 80, reps: 10 })] })],
      });
      const preset = makeTargetPreset({ exercises: [makeTargetPresetExercise({ sets: [] })] });
      const payload = buildPresetUpdateExercises(session, preset, allCompleted(session));
      expect(payload![0].sets).toEqual([expect.objectContaining({ weight: 80, reps: 10 })]);
    });

    it('treats a null set_type as normal on both sides', () => {
      const session = makePreset({
        exercises: [makeSessionExercise({ sets: [makeSessionSet({ set_type: null })] })],
      });
      const preset = makeTargetPreset({
        exercises: [makeTargetPresetExercise({ sets: [makeTargetPresetSet({ set_type: 'normal' })] })],
      });
      expect(buildPresetUpdateExercises(session, preset, allCompleted(session))).toBeNull();
    });

    it('passes kg through with float-noise normalization instead of a unit round-trip', () => {
      const session = makePreset({
        exercises: [makeSessionExercise({ sets: [makeSessionSet({ weight: 102.50000000001 })] })],
      });
      const preset = makeTargetPreset({
        exercises: [makeTargetPresetExercise({ sets: [makeTargetPresetSet({ weight: 102.5 })] })],
      });
      expect(buildPresetUpdateExercises(session, preset, allCompleted(session))).toBeNull();
    });

    it('pairs duplicate exercises in order so both keep their own image and sets', () => {
      const session = makePreset({
        exercises: [
          makeSessionExercise(),
          makeSessionExercise({
            id: 'entry-2',
            sets: [makeSessionSet({ id: 102, weight: 60 })],
          }),
        ],
      });
      const preset = makeTargetPreset({
        exercises: [
          makeTargetPresetExercise({ image_url: 'a1.jpg' }),
          makeTargetPresetExercise({
            id: 802,
            image_url: 'a2.jpg',
            sets: [makeTargetPresetSet({ weight: 60 })],
          }),
        ],
      });
      expect(buildPresetUpdateExercises(session, preset, allCompleted(session))).toBeNull();
    });
  });
});
