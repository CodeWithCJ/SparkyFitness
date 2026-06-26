import { describe, expect, it } from 'vitest';
import { zodSchema } from 'ai';
import type { z } from 'zod';
import { manageFoodInput, manageFoodSchema } from '../ai/tools/schemas/food.js';
import {
  manageExerciseInput,
  manageExerciseSchema,
} from '../ai/tools/schemas/exercise.js';
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
  properties?: Record<string, { enum?: string[] }>;
  required?: string[];
}

function toJson(schema: z.ZodType): JsonSchemaObject {
  return zodSchema(schema).jsonSchema as JsonSchemaObject;
}

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
        'update_existing_entries',
        'serving_size',
        'serving_unit',
        'brand',
        'quantity',
        'unit',
        'meal_type',
        'entry_date',
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
        'gi',
        'entry_id',
        'entry_type',
        'description',
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
        'log_food',
        'create_food',
        'search_meal',
        'log_meal',
        'list_diary',
        'delete_entry',
        'delete_food',
        'update_entry',
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
        'exercise_ids',
        'name',
        'searchTerm',
        'muscleGroup',
        'equipment',
        'limit',
        'offset',
        'category',
        'calories_per_hour',
        'description',
        'entry_date',
        'duration_minutes',
        'calories_burned',
        'notes',
        'distance',
        'avg_heart_rate',
        'steps',
        'sets',
        'preset_id',
        'preset_name',
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
        'log_workout_preset',
        'update_exercise_entry',
        'delete_exercise_entry',
        'get_exercise_details',
        'create_workout_preset',
        'get_exercise_progress',
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
        'category_name',
        'value',
        'unit',
        'notes',
        'data_type',
        'mood_value',
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
      ],
      actions: ['get_goals', 'set_goals', 'list_goal_timeline'],
    },
    {
      name: 'manageProfileInput',
      schema: manageProfileInput,
      properties: [
        'action',
        'display_name',
        'email',
        'image',
        'timezone',
        'energy_unit',
        'default_weight_unit',
        'default_measurement_unit',
        'default_distance_unit',
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
      properties: ['image_url'],
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

  it('manageGoalsSchema requires start_date for set_goals', () => {
    expect(
      manageGoalsSchema.safeParse({ action: 'set_goals', calories: 2200 })
        .success
    ).toBe(false);
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
});
