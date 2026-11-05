import { z } from 'zod';
import {
  EXERCISE_ALTERNATIVE_MODES,
  EXERCISE_MODALITIES,
  WORKOUT_FEEDBACK_DIFFICULTIES,
  WORKOUT_FEEDBACK_PAIN_NOTE_MAX_LENGTH,
  RAMP_INCREMENT_MAX_KG,
  RIR_MAX,
  RIR_MIN,
  WORKOUT_LOCATION_MAX_LENGTH,
  workoutFormatSchema,
} from '@workspace/shared';
import {
  dateSchema,
  optionalEntryTimeSchema,
  setTypeEnum,
  paginationSchema,
  uuidSchema,
} from './common.js';

const exerciseSetSchema = z
  .object({
    reps: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of repetitions'),
    weight: z.coerce.number().min(0).optional().describe('Weight in kg'),
    duration: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Duration in seconds'),
    distance: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Distance in km — cardio sets'),
    rest_time: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Rest time in seconds'),
    set_type: setTypeEnum.default('Working Set'),
    rpe: z.coerce
      .number()
      .min(0)
      .max(10)
      .optional()
      .describe('Rate of Perceived Exertion (0-10 scale, one decimal allowed)'),
    rir: z.coerce
      .number()
      .min(RIR_MIN)
      .max(RIR_MAX)
      .optional()
      .describe('Reps in reserve (0 = failure, 0-10, halves allowed)'),
    notes: z.string().max(1000).optional().describe('Note for this set'),
  })
  .strict();

const searchExercisesSchema = z
  .object({
    action: z.literal('search_exercises'),
    searchTerm: z
      .string()
      .min(1)
      .max(200)
      .describe('Name or part of exercise name'),
    muscleGroup: z
      .string()
      .optional()
      .describe(
        "Muscle group filter (canonical: 'abdominals', 'biceps', 'chest', 'quadriceps', etc.)"
      ),
    equipment: z
      .string()
      .optional()
      .describe(
        "Equipment filter (canonical: 'barbell', 'dumbbell', 'cable', 'machine', 'body only', etc.)"
      ),
    ...paginationSchema.shape,
  })
  .strict();

const createExerciseSchema = z
  .object({
    action: z.literal('create_exercise'),
    name: z.string().min(1).max(200).describe('Full name for the exercise'),
    category: z
      .string()
      .optional()
      .describe("Category (e.g., 'Strength', 'Cardio')"),
    calories_per_hour: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Estimated calories burned per hour'),
    description: z
      .string()
      .max(1000)
      .optional()
      .describe('Description of the exercise'),
    modality: z
      .enum(EXERCISE_MODALITIES)
      .optional()
      .describe(
        'Which set editor the exercise uses; defaults to a value derived from the category'
      ),
  })
  .strict();

const logExerciseSchema = z
  .object({
    action: z.literal('log_exercise'),
    exercise_id: uuidSchema.optional().describe('UUID of the exercise'),
    exercise_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Name of the exercise (alternative to ID)'),
    entry_date: dateSchema,
    entry_time: optionalEntryTimeSchema,
    duration_minutes: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Duration in minutes'),
    calories_burned: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Calories burned'),
    notes: z.string().max(2000).optional().describe('Additional notes'),
    distance: z.coerce
      .number()
      .min(0)
      .optional()
      .describe(
        "Distance covered, in the user's distance unit (e.g. km) — for cardio"
      ),
    avg_heart_rate: z.coerce
      .number()
      .int()
      .min(0)
      .max(300)
      .optional()
      .describe('Average heart rate in bpm — for cardio'),
    steps: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Step count for the activity'),
    sets: z
      .union([z.array(exerciseSetSchema), z.string()])
      .optional()
      .describe('Set details as array or JSON string'),
  })
  .strict();

const listExerciseDiarySchema = z
  .object({
    action: z.literal('list_exercise_diary'),
    entry_date: dateSchema,
  })
  .strict();

const getWorkoutPresetsSchema = z
  .object({
    action: z.literal('get_workout_presets'),
  })
  .strict();

// workout_presets.id is a numeric (SERIAL) primary key, unlike most other
// entities in this tool file which use UUIDs.
const presetIdSchema = z.coerce
  .number()
  .int()
  .positive()
  .describe('Numeric ID of the workout preset');

const PRESET_NAME_LOOKUP =
  'Name of a preset you own or that is family-shared (alternative to ID). Public presets outside those scopes must use preset_id.';

const confirmedSchema = z
  .boolean()
  .optional()
  .describe(
    'Must be true to apply the mutation. If omitted or false, the tool returns a confirmation prompt and does not change anything.'
  );

const getWorkoutPresetSchema = z
  .object({
    action: z.literal('get_workout_preset'),
    preset_id: presetIdSchema.optional(),
    preset_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe(PRESET_NAME_LOOKUP),
  })
  .strict();

// A preset's saved sets. Same shape as exerciseSetSchema minus rpe, which
// diary sets support but workout_preset_exercise_sets has no column for.
const presetSetSchema = z
  .object({
    set_type: setTypeEnum.default('Working Set'),
    reps: z.coerce.number().int().min(0).optional(),
    weight: z.coerce.number().min(0).optional().describe('Weight in kg'),
    duration: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Duration in seconds'),
    distance: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Distance in km — cardio sets'),
    rest_time: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Rest time in seconds'),
    notes: z.string().max(1000).optional().describe('Note for this set'),
  })
  .strict();

// Between-session progression and the within-session ramp. On
// update_workout_preset a field left out keeps the preset's current value
// (matched by exercise_id); null clears it.
const presetProgressionFields = {
  progression_mode: z
    .enum(['rep_goal', 'fixed', 'step_load', 'manual', 'double', 'triple'])
    .nullable()
    .optional()
    .describe(
      'Between-session overload: rep_goal (total reps across working sets), fixed (reps per set), step_load (raise reps at the same load), double (reps climb from rep_range_min to rep_goal per set, then load goes up and reps reset), triple (like double, but adds up to 2 sets before adding load), manual (off). Weight modes suggest a ~10% deload after 3 missed sessions at one load'
    ),
  rep_goal: z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .describe(
      'Total reps (rep_goal/step_load), reps per set (fixed), or top of the per-set rep range (double/triple)'
    ),
  rep_range_min: z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .describe('Bottom of the per-set rep range for double/triple'),
  increment_type: z
    .enum(['weight', 'reps'])
    .nullable()
    .optional()
    .describe('What goes up once the goal is met'),
  increment_value: z.coerce
    .number()
    .positive()
    .nullable()
    .optional()
    .describe(
      'Amount added next session once the goal is met: kg when increment_type is weight, reps otherwise'
    ),
  equipment_brand: z
    .string()
    .max(100)
    .nullable()
    .optional()
    .describe('Equipment or machine brand'),
  ramp_increment: z.coerce
    .number()
    .min(-RAMP_INCREMENT_MAX_KG)
    .max(RAMP_INCREMENT_MAX_KG)
    .nullable()
    .optional()
    .describe(
      'Optional per-set ramp in kg within ONE session: each successive working set is pre-filled this much heavier than the first (negative = back-off sets ramp down). Warm-up and drop sets are skipped. Not the between-session progression increment.'
    ),
};

// One exercise entry within a preset. Exercises that share the same
// superset_group are performed back-to-back as a superset.
export const presetExerciseSchema = z
  .object({
    exercise_id: uuidSchema,
    superset_group: z.coerce
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Exercises sharing the same superset_group number are grouped as a superset'
      ),
    ...presetProgressionFields,
    sets: z
      .array(presetSetSchema)
      .optional()
      .describe('Planned sets for this exercise in the preset'),
  })
  .strict()
  // Same rule as the REST preset schema: a rep increment is a whole number.
  // Step-load always raises reps, whatever increment_type says.
  .superRefine((val, ctx) => {
    const repsIncrement =
      val.increment_type === 'reps' || val.progression_mode === 'step_load';
    if (
      repsIncrement &&
      typeof val.increment_value === 'number' &&
      !Number.isInteger(val.increment_value)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Rep increment must be a whole number',
        path: ['increment_value'],
      });
    }
  });

const presetExercisesInputSchema = z
  .union([z.array(presetExerciseSchema), z.string()])
  .describe(
    'Exercises as an array of objects or a JSON string; each item is {exercise_id, sets?, superset_group?, progression_mode?, rep_goal?, rep_range_min?, increment_type?, increment_value?, equipment_brand?, ramp_increment?}'
  );

export type PresetExerciseInput = z.infer<typeof presetExerciseSchema>;

export const wodScoreInputSchema = z
  .object({
    score_type: z.enum(['time', 'rounds_reps', 'total_reps', 'completion']),
    rounds_completed: z.coerce.number().int().min(0).optional().nullable(),
    reps_completed: z.coerce.number().int().min(0).optional().nullable(),
    elapsed_seconds: z.coerce.number().int().min(0).optional().nullable(),
    status: z.enum(['rx', 'scaled']).optional().nullable(),
    scaling_notes: z.string().max(1000).optional().nullable(),
  })
  .strict();

export type WodScoreInput = z.infer<typeof wodScoreInputSchema>;

const workoutLocationSchema = z
  .string()
  .trim()
  .min(1)
  .max(WORKOUT_LOCATION_MAX_LENGTH)
  .optional()
  .describe(
    'Gym / location name for this session (free text, e.g. "Home gym")'
  );

const logWorkoutPresetSchema = z
  .object({
    action: z.literal('log_workout_preset'),
    preset_id: presetIdSchema.optional(),
    preset_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe(PRESET_NAME_LOOKUP),
    entry_date: dateSchema,
    wod_score: z
      .union([wodScoreInputSchema, z.string()])
      .optional()
      .describe(
        'WOD / Interval result score (e.g. { score_type: "rounds_reps", rounds_completed: 7, reps_completed: 12, status: "rx" })'
      ),
    location: workoutLocationSchema,
  })
  .strict();

const updateExerciseEntrySchema = z
  .object({
    action: z.literal('update_exercise_entry'),
    entry_id: uuidSchema.describe('UUID of the exercise entry to update'),
    entry_date: dateSchema
      .optional()
      .describe('New date for the entry (YYYY-MM-DD)'),
    entry_time: optionalEntryTimeSchema,
    duration_minutes: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Duration in minutes'),
    calories_burned: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Calories burned'),
    notes: z.string().max(2000).optional().describe('Additional notes'),
    distance: z.coerce
      .number()
      .min(0)
      .optional()
      .describe(
        "Distance covered, in the user's distance unit (e.g. km) — for cardio"
      ),
    avg_heart_rate: z.coerce
      .number()
      .int()
      .min(0)
      .max(300)
      .optional()
      .describe('Average heart rate in bpm — for cardio'),
    steps: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Step count for the activity'),
    sets: z
      .union([z.array(exerciseSetSchema), z.string()])
      .optional()
      .describe(
        'Replacement set details as array or JSON string; replaces all existing sets when provided'
      ),
  })
  .strict();

const deleteExerciseEntrySchema = z
  .object({
    action: z.literal('delete_exercise_entry'),
    entry_id: uuidSchema.describe('UUID of the exercise entry to delete'),
  })
  .strict();

const getExerciseDetailsSchema = z
  .object({
    action: z.literal('get_exercise_details'),
    exercise_id: uuidSchema.optional().describe('UUID of the exercise'),
    exercise_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Name of the exercise (alternative to ID)'),
  })
  .strict();

const duplicateExerciseSchema = z
  .object({
    action: z.literal('duplicate_exercise'),
    exercise_id: uuidSchema.optional().describe('UUID of the exercise to copy'),
    exercise_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Exact name of the exercise to copy (alternative to ID)'),
    name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Name for the copy; defaults to "<original name> (copy)"'),
  })
  .strict();

const createWorkoutPresetSchema = z
  .object({
    action: z.literal('create_workout_preset'),
    name: z.string().min(1).max(200).describe('Name of the workout preset'),
    description: z
      .string()
      .max(1000)
      .optional()
      .describe('Description for the preset'),
    is_public: z
      .boolean()
      .optional()
      .describe('Whether the preset is shared publicly'),
    workout_format: workoutFormatSchema
      .optional()
      .default('standard')
      .describe(
        'Workout structure / timer format: "standard" (default), "interval", "tabata", "amrap", "emom", or "for_time"'
      ),
    time_cap_seconds: z.coerce
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Time cap in seconds (required for AMRAP, optional for For Time / EMOM)'
      ),
    exercises: presetExercisesInputSchema,
  })
  .strict();

const updateWorkoutPresetSchema = z
  .object({
    action: z.literal('update_workout_preset'),
    preset_id: presetIdSchema.describe('ID of the workout preset to update'),
    confirmed: confirmedSchema,
    name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('New name for the preset'),
    description: z
      .string()
      .max(1000)
      .optional()
      .describe('New description for the preset'),
    is_public: z
      .boolean()
      .optional()
      .describe('Whether the preset is shared publicly'),
    workout_format: workoutFormatSchema
      .optional()
      .describe(
        'Workout structure / timer format: "standard", "interval", "tabata", "amrap", "emom", or "for_time"'
      ),
    time_cap_seconds: z.coerce
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Time cap in seconds'),
    exercises: presetExercisesInputSchema
      .optional()
      .describe(
        'Replacement exercises as an array of objects or a JSON string; when provided, REPLACES the entire exercise list, ' +
          'so call get_workout_preset first and include every exercise that should remain (not just the ones being changed). ' +
          'Each item is {exercise_id, sets?, superset_group?, progression_mode?, rep_goal?, rep_range_min?, increment_type?, increment_value?, equipment_brand?, ramp_increment?}'
      ),
  })
  .strict();

const deleteWorkoutPresetSchema = z
  .object({
    action: z.literal('delete_workout_preset'),
    preset_id: presetIdSchema.describe('ID of the workout preset to delete'),
    confirmed: confirmedSchema,
  })
  .strict();

const getExerciseProgressSchema = z
  .object({
    action: z.literal('get_exercise_progress'),
    exercise_id: uuidSchema.optional().describe('UUID of the exercise'),
    exercise_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Name of the exercise (alternative to ID)'),
    start_date: dateSchema
      .optional()
      .describe('Start date for progress tracking'),
    end_date: dateSchema.optional().describe('End date for progress tracking'),
    ...paginationSchema.shape,
  })
  .strict();

const suggestAlternativesSchema = z
  .object({
    action: z.literal('suggest_alternatives'),
    exercise_id: uuidSchema.optional().describe('UUID of the exercise'),
    exercise_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Name of the exercise (alternative to ID)'),
    alternative_mode: z
      .enum(EXERCISE_ALTERNATIVE_MODES)
      .optional()
      .describe(
        'similar (default) prefers the same equipment; different_equipment only returns exercises using none of its equipment'
      ),
    equipment: z
      .string()
      .max(500)
      .optional()
      .describe(
        "Comma-separated equipment the user has (e.g. 'dumbbell, bands'); results need nothing else"
      ),
    avoid_muscles: z
      .string()
      .max(500)
      .optional()
      .describe(
        "Comma-separated muscles to avoid, e.g. for an injury ('shoulders')"
      ),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

const rateWorkoutSchema = z
  .object({
    action: z.literal('rate_workout'),
    entry_id: uuidSchema.describe(
      'Exercise diary entry UUID (from list_exercise_diary); identifies the workout session it belongs to'
    ),
    scope: z
      .enum(['session', 'exercise'])
      .default('session')
      .describe(
        'session (default) rates the whole workout; exercise rates only this exercise'
      ),
    difficulty: z
      .enum(WORKOUT_FEEDBACK_DIFFICULTIES)
      .nullable()
      .optional()
      .describe('too_easy | just_right | too_hard'),
    pain: z
      .boolean()
      .optional()
      .describe(
        'Pain or discomfort was felt; omit to keep what is already recorded'
      ),
    pain_note: z
      .string()
      .max(WORKOUT_FEEDBACK_PAIN_NOTE_MAX_LENGTH)
      .optional()
      .describe('What hurt (implies pain=true)'),
  })
  .strict()
  .refine((value) => value.pain !== false || !value.pain_note, {
    message: 'pain_note cannot be combined with pain=false',
    path: ['pain_note'],
  });

const getWorkoutCoachingSchema = z
  .object({
    action: z.literal('get_workout_coaching'),
    exercise_id: uuidSchema.optional().describe('UUID of one exercise'),
    exercise_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Name of one exercise (alternative to ID)'),
    preset_id: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Workout preset ID — coaching for every exercise in it'),
    preset_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe(PRESET_NAME_LOOKUP),
  })
  .strict();

export const manageExerciseSchema = z.discriminatedUnion('action', [
  searchExercisesSchema,
  createExerciseSchema,
  logExerciseSchema,
  listExerciseDiarySchema,
  getWorkoutPresetsSchema,
  getWorkoutPresetSchema,
  logWorkoutPresetSchema,
  updateExerciseEntrySchema,
  deleteExerciseEntrySchema,
  getExerciseDetailsSchema,
  duplicateExerciseSchema,
  createWorkoutPresetSchema,
  updateWorkoutPresetSchema,
  deleteWorkoutPresetSchema,
  getExerciseProgressSchema,
  suggestAlternativesSchema,
  rateWorkoutSchema,
  getWorkoutCoachingSchema,
]);

export type ManageExerciseInput = z.infer<typeof manageExerciseSchema>;

// Flat input shape published to the LLM as `inputSchema`. See comment on
// manageFoodInput in ./food.js for the rationale. Runtime validation still
// uses manageExerciseSchema in the tool handler via safeParse.
export const manageExerciseInput = z.object({
  action: z
    .enum([
      'search_exercises',
      'create_exercise',
      'log_exercise',
      'list_exercise_diary',
      'get_workout_presets',
      'get_workout_preset',
      'log_workout_preset',
      'update_exercise_entry',
      'delete_exercise_entry',
      'get_exercise_details',
      'duplicate_exercise',
      'create_workout_preset',
      'update_workout_preset',
      'delete_workout_preset',
      'get_exercise_progress',
      'suggest_alternatives',
      'rate_workout',
      'get_workout_coaching',
    ])
    .optional()
    .describe(
      'Optional action to perform (server infers if omitted); see tool description for per-action fields.'
    ),
  // identity
  exercise_id: uuidSchema
    .optional()
    .describe(
      'Exercise UUID. REQUIRED for "log_exercise" if exercise_name is not provided.'
    ),
  exercise_name: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      'Exercise name (e.g. "Walking", "Running", "Squats"). REQUIRED for "log_exercise" if exercise_id is not provided.'
    ),
  exercises: z
    .union([
      z.array(
        z.object({
          exercise_id: uuidSchema,
          superset_group: z.coerce.number().int().min(1).optional(),
          ...presetProgressionFields,
          sets: z
            .array(
              z.object({
                set_type: setTypeEnum.optional(),
                reps: z.coerce.number().int().min(0).optional(),
                weight: z.coerce.number().min(0).optional(),
                duration: z.coerce.number().int().min(0).optional(),
                distance: z.coerce.number().min(0).optional(),
                rest_time: z.coerce.number().min(0).optional(),
                notes: z.string().max(1000).optional(),
              })
            )
            .optional(),
        })
      ),
      z.string(),
    ])
    .optional()
    .describe(
      'Exercises as array of objects or JSON string — for create_workout_preset / update_workout_preset. ' +
        'On update_workout_preset this REPLACES the full exercise list, so call get_workout_preset first and include every exercise that should remain. ' +
        'Each item is {exercise_id, sets?:[{reps,weight,duration,distance,rest_time,set_type,notes}], superset_group?, progression_mode?, rep_goal?, rep_range_min?, increment_type?, increment_value?, equipment_brand?, ramp_increment?}; items sharing the same superset_group are grouped as a superset. ' +
        'progression_* / increment_* are between-session overload (increment_value is kg for weight). ramp_increment is kg added to each successive working set within ONE session (negative ramps down). ' +
        'On update, a progression or ramp field left out keeps the current value; null clears it.'
    ),
  name: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      'Name — for create_exercise / create_workout_preset / update_workout_preset'
    ),
  // search
  searchTerm: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Search term — required for search_exercises'),
  muscleGroup: z
    .string()
    .optional()
    .describe("Muscle group filter (e.g., 'Chest')"),
  equipment: z
    .string()
    .optional()
    .describe(
      "Equipment filter (e.g., 'Dumbbell', 'None') for search_exercises; comma-separated equipment the user has for suggest_alternatives"
    ),
  alternative_mode: z
    .enum(EXERCISE_ALTERNATIVE_MODES)
    .optional()
    .describe(
      'For suggest_alternatives: similar (default) or different_equipment'
    ),
  avoid_muscles: z
    .string()
    .optional()
    .describe(
      'For suggest_alternatives: comma-separated muscles to avoid (injury)'
    ),
  // workout feedback
  scope: z
    .enum(['session', 'exercise'])
    .optional()
    .describe(
      'For rate_workout: session (default) rates the whole workout, exercise only this entry'
    ),
  difficulty: z
    .enum(WORKOUT_FEEDBACK_DIFFICULTIES)
    .nullable()
    .optional()
    .describe('For rate_workout: too_easy | just_right | too_hard'),
  pain: z
    .boolean()
    .optional()
    .describe('For rate_workout: pain or discomfort was felt'),
  pain_note: z
    .string()
    .max(WORKOUT_FEEDBACK_PAIN_NOTE_MAX_LENGTH)
    .optional()
    .describe('For rate_workout: what hurt (only with pain=true)'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Pagination limit'),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Pagination offset'),
  // create
  category: z
    .string()
    .optional()
    .describe("Exercise category (e.g., 'Strength', 'Cardio')"),
  calories_per_hour: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('Estimated calories burned per hour'),
  description: z
    .string()
    .max(1000)
    .optional()
    .describe(
      'Description — of the exercise for create_exercise, or of the preset for create_workout_preset / update_workout_preset'
    ),
  modality: z
    .enum(EXERCISE_MODALITIES)
    .optional()
    .describe(
      'Which set editor the exercise uses; defaults to a value derived from the category'
    ),
  // log
  entry_date: dateSchema.optional().describe('Date for the entry (YYYY-MM-DD)'),
  entry_time: optionalEntryTimeSchema,
  duration_minutes: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('Duration in minutes'),
  calories_burned: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('Calories burned'),
  notes: z.string().max(2000).optional().describe('Additional notes'),
  distance: z.coerce
    .number()
    .min(0)
    .optional()
    .describe(
      "Distance covered, in the user's distance unit (e.g. km) — cardio, for log/update"
    ),
  avg_heart_rate: z.coerce
    .number()
    .int()
    .min(0)
    .max(300)
    .optional()
    .describe('Average heart rate in bpm — cardio, for log/update'),
  steps: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Step count for the activity — for log/update'),
  sets: z
    .union([
      z.array(
        z.object({
          reps: z.coerce.number().int().min(0).optional(),
          weight: z.coerce.number().min(0).optional(),
          duration: z.coerce.number().int().min(0).optional(),
          distance: z.coerce.number().min(0).optional(),
          rest_time: z.coerce.number().min(0).optional(),
          set_type: setTypeEnum.optional(),
          rpe: z.coerce.number().min(0).max(10).optional(),
          rir: z.coerce.number().min(RIR_MIN).max(RIR_MAX).optional(),
          notes: z.string().max(1000).optional(),
        })
      ),
      z.string(),
    ])
    .optional()
    .describe(
      'Set details as array of objects or JSON string; per-set fields include rpe, rir and notes'
    ),
  // presets
  preset_id: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Workout preset ID — for log_workout_preset / update_workout_preset / delete_workout_preset / get_workout_coaching'
    ),
  preset_name: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(PRESET_NAME_LOOKUP),
  is_public: z
    .boolean()
    .optional()
    .describe(
      'Whether the workout preset is shared publicly — for create_workout_preset / update_workout_preset'
    ),
  workout_format: workoutFormatSchema
    .optional()
    .describe(
      'Workout structure / timer format ("standard", "interval", "tabata", "amrap", "emom", "for_time") — for create_workout_preset / update_workout_preset'
    ),
  time_cap_seconds: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Time cap in seconds — for create_workout_preset / update_workout_preset'
    ),
  wod_score: z
    .union([wodScoreInputSchema, z.string()])
    .optional()
    .describe(
      'WOD / Interval score results — for log_workout_preset ({score_type, rounds_completed?, reps_completed?, elapsed_seconds?, status?, scaling_notes?})'
    ),
  location: z
    .string()
    .max(WORKOUT_LOCATION_MAX_LENGTH)
    .optional()
    .describe('Gym / location name — for log_workout_preset'),
  confirmed: z
    .boolean()
    .optional()
    .describe(
      'Must be true to apply update_workout_preset or delete_workout_preset. If omitted or false, the tool returns a confirmation prompt and does not change anything.'
    ),
  // entry management
  entry_id: uuidSchema
    .optional()
    .describe(
      'Exercise diary entry UUID — for update_exercise_entry / delete_exercise_entry / rate_workout'
    ),
  // progress range
  start_date: dateSchema
    .optional()
    .describe('Start date for progress tracking'),
  end_date: dateSchema.optional().describe('End date for progress tracking'),
});
