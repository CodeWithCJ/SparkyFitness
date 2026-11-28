import { readdirSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { zodSchema } from 'ai';
import { z } from 'zod';
import {
  DAY_TIMEZONE_NOTE,
  dateSchema,
  optionalDateSchema,
  withDayNote,
} from '../ai/tools/schemas/common.js';
import { manageFoodInput, manageFoodSchema } from '../ai/tools/schemas/food.js';
import {
  manageExerciseInput,
  manageExerciseSchema,
} from '../ai/tools/schemas/exercise.js';
import {
  manageWorkoutPlansInput,
  manageWorkoutPlansSchema,
} from '../ai/tools/schemas/workoutPlans.js';
import {
  manageCheckinInput,
  manageCheckinSchema,
} from '../ai/tools/schemas/checkin.js';
import {
  manageGoalsInput,
  manageGoalsSchema,
} from '../ai/tools/schemas/goals.js';
import {
  manageProfileInput,
  manageProfileSchema,
} from '../ai/tools/schemas/profile.js';
import {
  manageHabitsInput,
  manageHabitsSchema,
} from '../ai/tools/schemas/habits.js';
import {
  manageWizardInput,
  manageWizardSchema,
} from '../ai/tools/schemas/wizard.js';
import {
  manageReportInput,
  manageReportSchema,
  dailyReportSchema,
} from '../ai/tools/schemas/report.js';
import {
  GetHealthSummarySchema,
  AnalyzeTrendsSchema,
  Get30DayTrendsSchema,
  DetectPatternsSchema,
  GenerateCoachingPlanSchema,
} from '../ai/tools/schemas/coach.js';
import {
  CheckEngagementSchema,
  GetLoggingStreakSchema,
  GetContextualNudgeSchema,
} from '../ai/tools/schemas/engagement.js';
import {
  AnalyzeFoodImageSchema,
  ScanLabelSchema,
} from '../ai/tools/schemas/vision.js';

interface JsonSchemaObject {
  type?: string;
  properties?: Record<string, { enum?: string[]; description?: string }>;
  required?: string[];
}

function toJson(schema: z.ZodType): JsonSchemaObject {
  return zodSchema(schema).jsonSchema as JsonSchemaObject;
}

describe('update_existing_entries in the published food schema', () => {
  it('stays a boolean with its description', () => {
    const prop = toJson(manageFoodInput).properties?.update_existing_entries as
      { type?: string; description?: string } | undefined;
    expect(prop?.type).toBe('boolean');
    expect(prop?.description).toContain('existing diary entries');
  });
});

describe('update_existing_entries through the published food schema', () => {
  const parseFlag = (value: unknown) =>
    manageFoodInput.safeParse({
      action: 'update_food_variant',
      update_existing_entries: value,
    });

  it.each([
    [true, true],
    [false, false],
    ['true', true],
    ['TRUE', true],
    ['false', false],
    [' false ', false],
    ['1', true],
    ['0', false],
    [1, true],
    [0, false],
    [null, undefined],
    ['', undefined],
    ['  ', undefined],
  ])('reads %j as %j', (value, expected) => {
    const result = parseFlag(value);
    expect(result.success).toBe(true);
    expect(result.data?.update_existing_entries).toBe(expected);
  });

  it.each(['yes please', 2, 'on'])('rejects %j', (value) => {
    expect(parseFlag(value).success).toBe(false);
  });

  it.each([null, '', undefined])(
    'leaves entries alone for %j after the strict parse',
    (value) => {
      const result = manageFoodSchema.safeParse({
        action: 'update_food_variant',
        food_id: '00000000-0000-4000-8000-000000000001',
        update_existing_entries: value,
      });
      expect(result.success).toBe(true);
      expect(
        result.success && 'update_existing_entries' in result.data
          ? result.data.update_existing_entries
          : 'missing'
      ).toBe(false);
    }
  );
});

describe('published (flat) chatbot tool schemas', () => {
  const flatCases: Array<{
    name: string;
    schema: z.ZodType;
    properties: string[];
    actions?: string[];
  }> = [
    {
      name: 'manageFoodInput',
      schema: manageFoodInput,
      properties: [
        'action',
        'food_name',
        'food_id',
        'variant_id',
        'external_id',
        'update_existing_entries',
        'serving_size',
        'serving_unit',
        'brand',
        'new_name',
        'barcode',
        'quantity',
        'unit',
        'meal_type',
        'meal_type_id',
        'entry_date',
        'entry_time',
        'is_quick_food',
        'estimate_confidence',
        'meal_id',
        'meal_name',
        'search_type',
        'limit',
        'offset',
        'calories',
        'protein',
        'carbs',
        'fat',
        'saturated_fat',
        'polyunsaturated_fat',
        'monounsaturated_fat',
        'trans_fat',
        'cholesterol',
        'sodium',
        'potassium',
        'fiber',
        'sugar',
        'vitamin_a',
        'vitamin_c',
        'calcium',
        'iron',
        'caffeine_mg',
        'alcohol_g',
        'water_ml',
        'gi',
        'entry_id',
        'entry_type',
        'description',
        'notes',
        'target_date',
        'source_date',
        'amount_ml',
        'start_date',
        'end_date',
        'provider_type',
      ],
      actions: [
        'search_food',
        'lookup_food_nutrition',
        'list_meal_types',
        'log_food',
        'log_external_food',
        'create_food',
        'search_meal',
        'log_meal',
        'list_diary',
        'delete_entry',
        'delete_food',
        'update_entry',
        'set_food_notes',
        'set_food_barcode',
        'update_food',
        'update_food_variant',
        'copy_from_yesterday',
        'save_as_meal_template',
        'log_water',
        'get_nutritional_summary',
        'get_water_history',
      ],
    },
    {
      name: 'manageExerciseInput',
      schema: manageExerciseInput,
      properties: [
        'action',
        'exercise_id',
        'exercise_name',
        'exercises',
        'name',
        'searchTerm',
        'muscleGroup',
        'equipment',
        'alternative_mode',
        'avoid_muscles',
        'scope',
        'difficulty',
        'pain',
        'pain_note',
        'limit',
        'offset',
        'category',
        'calories_per_hour',
        'description',
        'modality',
        'health_activity_type',
        'entry_date',
        'entry_time',
        'duration_minutes',
        'calories_burned',
        'notes',
        'distance',
        'avg_heart_rate',
        'steps',
        'sets',
        'preset_id',
        'preset_name',
        'is_public',
        'workout_format',
        'time_cap_seconds',
        'wod_score',
        'location',
        'confirmed',
        'entry_id',
        'start_date',
        'end_date',
      ],
      actions: [
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
      ],
    },
    {
      name: 'manageWorkoutPlansInput',
      schema: manageWorkoutPlansInput,
      properties: [
        'action',
        'plan_id',
        'confirmed',
        'plan_name',
        'description',
        'schedule_type',
        'entry_mode',
        'is_active',
        'start_date',
        'end_date',
        'date',
        'assignment_ids',
        'sessions',
        'assignments',
      ],
      actions: [
        'list_workout_plans',
        'get_workout_plan',
        'get_active_workout_plan',
        'create_workout_plan',
        'update_workout_plan',
        'delete_workout_plan',
        'propose_plan_changes',
        'apply_plan_changes',
      ],
    },
    {
      name: 'manageCheckinInput',
      schema: manageCheckinInput,
      properties: [
        'action',
        'entry_date',
        'weight',
        'weight_unit',
        'steps',
        'height',
        'height_unit',
        'neck',
        'waist',
        'hips',
        'measurements_unit',
        'body_fat',
        'muscle_mass',
        'bone_mass',
        'body_water',
        'category_name',
        'value',
        'unit',
        'notes',
        'data_type',
        'mood_value',
        'energy_value',
        'focus_value',
        'mood_tags',
        'start_time',
        'end_time',
        'fasting_status',
        'fasting_type',
        'duration_seconds',
        'sleep_score',
        'bedtime',
        'wake_time',
        'source',
        'start_date',
        'end_date',
      ],
      actions: [
        'log_biometrics',
        'log_custom_metric',
        'list_categories',
        'create_category',
        'log_mood',
        'log_fasting',
        'log_sleep',
        'list_checkin_diary',
        'get_fasting_status',
        'get_biometrics_history',
        'get_custom_metrics_history',
        'get_oral_care_summary',
      ],
    },
    {
      name: 'manageGoalsInput',
      schema: manageGoalsInput,
      properties: [
        'action',
        'target_date',
        'start_date',
        'calories',
        'protein',
        'carbs',
        'fat',
        'water_goal_ml',
        'weight',
        'weight_unit',
        'saturated_fat',
        'polyunsaturated_fat',
        'monounsaturated_fat',
        'trans_fat',
        'cholesterol',
        'sodium',
        'potassium',
        'dietary_fiber',
        'sugars',
        'vitamin_a',
        'vitamin_c',
        'calcium',
        'iron',
        'caffeine_mg',
        'alcohol_g',
        'custom_nutrients',
      ],
      actions: ['get_goals', 'set_goals', 'list_goal_timeline'],
    },
    {
      name: 'manageProfileInput',
      schema: manageProfileInput,
      properties: [
        'action',
        'display_name',
        'image',
        'timezone',
        'energy_unit',
        'default_weight_unit',
        'default_measurement_unit',
        'default_distance_unit',
        'default_temperature_unit',
        'water_display_unit',
      ],
      actions: [
        'get_profile',
        'update_profile',
        'get_preferences',
        'update_preferences',
      ],
    },
    {
      name: 'manageHabitsInput',
      schema: manageHabitsInput,
      properties: [
        'action',
        'habit_id',
        'entry_date',
        'completed',
        'start_date',
        'end_date',
      ],
      actions: ['list_habits', 'log_habit', 'get_habit_history'],
    },
    {
      name: 'manageWizardInput',
      schema: manageWizardInput,
      properties: ['action', 'step', 'answer'],
      actions: ['daily_checkin'],
    },
    {
      name: 'manageReportInput',
      schema: manageReportInput,
      properties: ['action', 'end_date'],
      actions: ['get_weekly_report'],
    },
    {
      name: 'dailyReportSchema',
      schema: dailyReportSchema,
      properties: ['date', 'start_date', 'end_date'],
    },
    {
      name: 'GetHealthSummarySchema',
      schema: GetHealthSummarySchema,
      properties: ['start_date', 'end_date'],
    },
    {
      name: 'AnalyzeTrendsSchema',
      schema: AnalyzeTrendsSchema,
      properties: ['days'],
    },
    {
      name: 'Get30DayTrendsSchema',
      schema: Get30DayTrendsSchema,
      properties: ['end_date'],
    },
    {
      name: 'DetectPatternsSchema',
      schema: DetectPatternsSchema,
      properties: ['days'],
    },
    {
      name: 'GenerateCoachingPlanSchema',
      schema: GenerateCoachingPlanSchema,
      properties: ['goal', 'target_weight'],
    },
    {
      name: 'CheckEngagementSchema',
      schema: CheckEngagementSchema,
      properties: [],
    },
    {
      name: 'GetLoggingStreakSchema',
      schema: GetLoggingStreakSchema,
      properties: [],
    },
    {
      name: 'GetContextualNudgeSchema',
      schema: GetContextualNudgeSchema,
      properties: [],
    },
    {
      name: 'AnalyzeFoodImageSchema',
      schema: AnalyzeFoodImageSchema,
      properties: [
        'image_url',
        'description',
        'total_weight',
        'meal_type',
        'entry_date',
      ],
    },
    {
      name: 'ScanLabelSchema',
      schema: ScanLabelSchema,
      properties: ['image_url'],
    },
  ];

  it.each(flatCases)(
    '$name converts to a JSON schema with the expected properties',
    ({ schema, properties, actions }) => {
      const json = toJson(schema);

      expect(json.type).toBe('object');
      expect(Object.keys(json.properties ?? {})).toEqual(properties);

      if (actions) {
        expect(json.properties?.action?.enum).toEqual(actions);
      }
    }
  );

  // Regex lookaround (e.g. Zod v4's .email() pattern) is rejected by the
  // RE2-style validators some providers (Groq, xAI) apply to tool parameter
  // schemas, which fails the whole request. Keep published schemas RE2-safe.
  // Only actual `pattern` values are checked (recursively), so lookaround-like
  // text in a description or example can't cause a false positive.
  function collectPatterns(node: unknown, seen = new Set<object>()): string[] {
    if (!node || typeof node !== 'object' || seen.has(node)) return [];
    seen.add(node);
    const obj = node as Record<string, unknown>;
    const patterns: string[] = [];
    if (typeof obj.pattern === 'string') patterns.push(obj.pattern);
    for (const value of Object.values(obj)) {
      patterns.push(...collectPatterns(value, seen));
    }
    return patterns;
  }

  it.each(flatCases)(
    '$name has no regex lookaround in its published JSON schema patterns',
    ({ schema }) => {
      for (const pattern of collectPatterns(toJson(schema))) {
        expect(pattern).not.toMatch(/\(\?[=!<]/);
      }
    }
  );

  // create_food takes the nutrient basis from serving_size/serving_unit, and
  // quantity × unit is only the amount logged. A client reading only "Amount
  // consumed" must not send per-serving values as the amount eaten.
  it('manageFoodInput tells create_food clients that quantity is the amount logged, not the serving', () => {
    const properties = toJson(manageFoodInput).properties ?? {};

    expect(properties.quantity?.description).toContain(
      'For create_food, the amount logged when meal_type_id or meal_type is given'
    );
    expect(properties.quantity?.description).toContain(
      'serving_size/serving_unit'
    );
  });
});

describe('shared date params', () => {
  it('say which timezone days and "today" use', () => {
    const note =
      'profile timezone (UTC if none is set), so "today" resolves there.';
    const dateJson = toJson(z.object({ d: dateSchema, o: optionalDateSchema }));

    expect(dateJson.properties?.d?.description).toContain(note);
    expect(dateJson.properties?.o?.description).toContain(note);
  });

  it('keep the note when a call site re-describes the shared schema', () => {
    const json = toJson(
      z.object({ d: dateSchema.describe(withDayNote('Date to log for')) })
    );

    expect(json.properties?.d?.description).toMatch(
      /^Date to log for\. Days are calendar days in the active account's profile timezone/
    );
    expect(
      toJson(manageFoodInput).properties?.entry_date?.description
    ).toContain('profile timezone');
  });
});

describe('date params in the flat tool inputs', () => {
  // Every date, entry_date and *_date param carries the note. Symptom from/to
  // are not resolved as day keywords, so they must not (tested below).
  const modules: Record<string, Record<string, unknown>> = {};
  beforeAll(async () => {
    const dir = new URL('../ai/tools/schemas/', import.meta.url);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      modules[file] = await import(`../ai/tools/schemas/${file}`);
    }
  });

  const collect = () =>
    Object.entries(modules).flatMap(([file, exports]) =>
      Object.entries(exports)
        .filter(
          ([name, value]) =>
            /Input$/.test(name) &&
            typeof value === 'object' &&
            value !== null &&
            'safeParse' in value
        )
        .map(([name, value]) => ({
          key: `${file}:${name}`,
          schema: value as z.ZodType,
        }))
    );

  it('finds the flat inputs', () => {
    expect(collect().length).toBeGreaterThan(20);
  });

  it('mention the timezone note on every date, entry_date and *_date param', () => {
    const missing: string[] = [];
    for (const { key, schema } of collect()) {
      for (const [prop, def] of Object.entries(
        toJson(schema).properties ?? {}
      )) {
        if (!/^(date|entry_date|.+_date)$/.test(prop)) continue;
        if (!def.description?.includes(DAY_TIMEZONE_NOTE)) {
          missing.push(`${key}.${prop}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  // Symptom from/to are not run through the day-keyword resolver, so they
  // must not promise that "today" works.
  it('keeps the timezone note off symptom from/to', () => {
    const symptoms = collect().find((c) =>
      c.key.endsWith(':manageSymptomsInput')
    );
    expect(symptoms).toBeDefined();
    const props = toJson(symptoms!.schema).properties ?? {};
    expect(props.from).toBeDefined();
    expect(props.to).toBeDefined();
    expect(props.from?.description ?? '').not.toContain(DAY_TIMEZONE_NOTE);
    expect(props.to?.description ?? '').not.toContain(DAY_TIMEZONE_NOTE);
  });

  it('still accept "yesterday" and reject malformed days', () => {
    const schema = optionalDateSchema;
    expect(schema.safeParse('yesterday').success).toBe(true);
    expect(schema.safeParse('2026-11-25').success).toBe(true);
    expect(schema.safeParse(undefined).success).toBe(true);
    expect(schema.safeParse('25.11.2026').success).toBe(false);
    expect(dateSchema.safeParse('next week').success).toBe(false);
  });
});

describe('strict discriminated-union validation schemas', () => {
  it('manageFoodSchema accepts a valid log_food input', () => {
    const result = manageFoodSchema.safeParse({
      action: 'log_food',
      food_name: 'Eggs',
      quantity: 2,
      unit: 'piece',
      meal_type: 'breakfast',
      entry_date: '2026-06-11',
    });
    expect(result.success).toBe(true);
  });

  it('manageFoodSchema accepts custom meal type IDs for logging and moving entries', () => {
    const customMealTypeId = '66666666-6666-4666-8666-666666666666';
    expect(
      manageFoodSchema.safeParse({
        action: 'log_food',
        food_name: 'Eggs',
        meal_type_id: customMealTypeId,
      }).success
    ).toBe(true);
    expect(
      manageFoodSchema.safeParse({
        action: 'update_entry',
        entry_id: '33333333-3333-4333-8333-333333333333',
        entry_type: 'food_entry',
        meal_type_id: customMealTypeId,
      }).success
    ).toBe(true);
  });

  it('manageFoodSchema accepts food_name in place of entry_id for delete_entry and update_entry', () => {
    expect(
      manageFoodSchema.safeParse({
        action: 'delete_entry',
        food_name: 'Oatmeal',
        entry_date: '2026-06-10',
      }).success
    ).toBe(true);
    expect(
      manageFoodSchema.safeParse({
        action: 'update_entry',
        food_name: 'Oatmeal',
        meal_type: 'dinner',
      }).success
    ).toBe(true);
  });

  it('manageFoodSchema rejects food_name resolution for meal entries (food entries only)', () => {
    expect(
      manageFoodSchema.safeParse({
        action: 'delete_entry',
        food_name: 'Oatmeal',
        entry_type: 'food_entry_meal',
      }).success
    ).toBe(false);
    expect(
      manageFoodSchema.safeParse({
        action: 'update_entry',
        food_name: 'Oatmeal',
        entry_type: 'food_entry_meal',
        quantity: 2,
      }).success
    ).toBe(false);
    expect(
      manageFoodSchema.safeParse({
        action: 'delete_entry',
        entry_id: '33333333-3333-4333-8333-333333333333',
        entry_type: 'food_entry_meal',
      }).success
    ).toBe(true);
  });

  it('manageFoodSchema still requires some entry identifier for delete_entry and update_entry', () => {
    expect(manageFoodSchema.safeParse({ action: 'delete_entry' }).success).toBe(
      false
    );
    expect(
      manageFoodSchema.safeParse({ action: 'update_entry', quantity: 2 })
        .success
    ).toBe(false);
  });

  it('manageFoodSchema keeps meal_type as a built-in enum fallback (custom types go through meal_type_id)', () => {
    // The legacy fallback accepts only the built-in slots...
    expect(
      manageFoodSchema.safeParse({
        action: 'log_food',
        food_name: 'Eggs',
        meal_type: 'breakfast',
      }).success
    ).toBe(true);
    // ...and rejects anything else: custom meal types must NOT be passed by name.
    expect(
      manageFoodSchema.safeParse({
        action: 'log_food',
        food_name: 'Eggs',
        meal_type: 'invalid-slot',
      }).success
    ).toBe(false);
    // Custom meal types are selected by ID, not by name.
    expect(
      manageFoodSchema.safeParse({
        action: 'log_food',
        food_name: 'Eggs',
        meal_type_id: '66666666-6666-4666-8666-666666666666',
      }).success
    ).toBe(true);
  });

  it('manageFoodSchema rejects fields that do not belong to the action', () => {
    const result = manageFoodSchema.safeParse({
      action: 'list_diary',
      entry_date: '2026-06-11',
      quantity: 2,
    });
    expect(result.success).toBe(false);
  });

  it('manageFoodSchema rejects an unknown action', () => {
    const result = manageFoodSchema.safeParse({ action: 'bogus' });
    expect(result.success).toBe(false);
  });

  it('manageExerciseSchema accepts sets as an array or a JSON string', () => {
    const base = {
      action: 'log_exercise',
      exercise_name: 'Bench Press',
      entry_date: '2026-06-11',
    };
    expect(
      manageExerciseSchema.safeParse({
        ...base,
        sets: [{ reps: 10, weight: 60, set_type: 'Working Set' }],
      }).success
    ).toBe(true);
    expect(
      manageExerciseSchema.safeParse({
        ...base,
        sets: '[{"reps":10,"weight":60}]',
      }).success
    ).toBe(true);
  });

  it('manageCheckinSchema accepts a valid log_biometrics input and coerces numbers', () => {
    const result = manageCheckinSchema.safeParse({
      action: 'log_biometrics',
      entry_date: '2026-06-11',
      weight: '80.5',
      weight_unit: 'kg',
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.action === 'log_biometrics') {
      expect(result.data.weight).toBe(80.5);
    }
  });

  it('manageGoalsSchema accepts set_goals without start_date (defaults to today)', () => {
    expect(
      manageGoalsSchema.safeParse({ action: 'set_goals', calories: 2200 })
        .success
    ).toBe(true);
    expect(
      manageGoalsSchema.safeParse({
        action: 'set_goals',
        start_date: '2026-06-11',
        calories: 2200,
      }).success
    ).toBe(true);
  });

  it('manageProfileSchema rejects update_preferences with an invalid enum value', () => {
    expect(
      manageProfileSchema.safeParse({
        action: 'update_preferences',
        energy_unit: 'joules',
      }).success
    ).toBe(false);
  });

  it('manageHabitsSchema requires a UUID habit_id for log_habit', () => {
    expect(
      manageHabitsSchema.safeParse({
        action: 'log_habit',
        habit_id: 'not-a-uuid',
        entry_date: '2026-06-11',
        completed: true,
      }).success
    ).toBe(false);
  });

  it('manageWizardSchema defaults step to start', () => {
    const result = manageWizardSchema.safeParse({ action: 'daily_checkin' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.step).toBe('start');
    }
  });

  it('manageReportSchema accepts get_weekly_report with an optional end_date', () => {
    expect(
      manageReportSchema.safeParse({ action: 'get_weekly_report' }).success
    ).toBe(true);
    expect(
      manageReportSchema.safeParse({
        action: 'get_weekly_report',
        end_date: '2026-06-11',
      }).success
    ).toBe(true);
    expect(
      manageReportSchema.safeParse({
        action: 'get_weekly_report',
        end_date: 'June 11',
      }).success
    ).toBe(false);
  });

  it('manageWorkoutPlansSchema accepts create_workout_plan with sequential sessions', () => {
    const result = manageWorkoutPlansSchema.safeParse({
      action: 'create_workout_plan',
      plan_name: 'Upper Lower Split',
      schedule_type: 'sequential',
      sessions: [
        {
          session_name: 'Upper Body',
          exercise_name: 'Bench Press',
          sets: [{ reps: 10, weight: 80 }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('manageWorkoutPlansSchema accepts update_workout_plan with numeric plan_id and confirmed', () => {
    const result = manageWorkoutPlansSchema.safeParse({
      action: 'update_workout_plan',
      plan_id: 12,
      confirmed: true,
      plan_name: 'Updated Plan Name',
    });
    expect(result.success).toBe(true);
  });
});
