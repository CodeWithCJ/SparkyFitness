import nutrientGoalPreferenceRepository from '../models/nutrientGoalPreferenceRepository.js';
import customNutrientService from './customNutrientService.js';
import type { NutrientGoalType } from '@workspace/shared';

// Keep in sync with CENTRAL_NUTRIENT_CONFIG's `defaultGoalType` entries in
// SparkyFitnessFrontend/src/constants/nutrients.ts.
const BUILTIN_MAXIMUM_DEFAULTS = [
  'cholesterol',
  'sodium',
  'saturated_fat',
  'trans_fat',
  'sugars',
];

// Predefined nutrient keys that can have a goal-direction preference, mirrors
// nutrientDisplayPreferenceService's predefinedNutrients list (plus 'calories').
const PREDEFINED_NUTRIENT_KEYS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'dietary_fiber',
  'sugars',
  'sodium',
  'cholesterol',
  'saturated_fat',
  'monounsaturated_fat',
  'polyunsaturated_fat',
  'trans_fat',
  'potassium',
  'vitamin_a',
  'vitamin_c',
  'iron',
  'calcium',
];

export interface EffectiveGoalPreference {
  goalType: NutrientGoalType;
  targetMin?: number;
  targetMax?: number;
}

function builtinDefaultFor(nutrientKey: string): NutrientGoalType {
  return BUILTIN_MAXIMUM_DEFAULTS.includes(nutrientKey) ? 'maximum' : 'minimum';
}

async function getEffectiveGoalTypes(
  userId: string
): Promise<Record<string, EffectiveGoalPreference>> {
  const [overrides, customNutrients] = await Promise.all([
    nutrientGoalPreferenceRepository.getNutrientGoalPreferences(userId),
    customNutrientService.getCustomNutrients(userId),
  ]);

  const overrideMap = new Map(overrides.map((row) => [row.nutrient_key, row]));
  const customNutrientNames = customNutrients
    .filter((cn: { name?: string }) => cn && cn.name)
    .map((cn: { name: string }) => cn.name);

  const allKeys = [...PREDEFINED_NUTRIENT_KEYS, ...customNutrientNames];
  const result: Record<string, EffectiveGoalPreference> = {};

  for (const key of allKeys) {
    const override = overrideMap.get(key);
    if (override) {
      result[key] = {
        goalType: override.goal_type,
        targetMin: override.target_min ?? undefined,
        targetMax: override.target_max ?? undefined,
      };
    } else {
      result[key] = { goalType: builtinDefaultFor(key) };
    }
  }
  return result;
}

async function upsertGoalPreference(
  userId: string,
  nutrientKey: string,
  goalType: NutrientGoalType,
  targetMin?: number | null,
  targetMax?: number | null
) {
  if (!['minimum', 'maximum', 'target'].includes(goalType)) {
    throw new Error(`Invalid goal_type: ${goalType}`);
  }
  if (goalType === 'target') {
    if (
      targetMin === undefined ||
      targetMin === null ||
      targetMax === undefined ||
      targetMax === null
    ) {
      throw new Error('target goal type requires both targetMin and targetMax');
    }
    if (targetMin > targetMax) {
      throw new Error('targetMin must be <= targetMax');
    }
  }
  return nutrientGoalPreferenceRepository.upsertNutrientGoalPreference(
    userId,
    nutrientKey,
    goalType,
    goalType === 'target' ? (targetMin ?? null) : null,
    goalType === 'target' ? (targetMax ?? null) : null
  );
}

async function resetGoalPreference(userId: string, nutrientKey: string) {
  await nutrientGoalPreferenceRepository.deleteNutrientGoalPreference(
    userId,
    nutrientKey
  );
  return { nutrientKey, goalType: builtinDefaultFor(nutrientKey) };
}

async function renameGoalPreferenceKey(
  userId: string,
  oldKey: string,
  newKey: string
) {
  if (oldKey === newKey) return;
  await nutrientGoalPreferenceRepository.renameNutrientGoalPreferenceKey(
    userId,
    oldKey,
    newKey
  );
}

export {
  getEffectiveGoalTypes,
  upsertGoalPreference,
  resetGoalPreference,
  renameGoalPreferenceKey,
  BUILTIN_MAXIMUM_DEFAULTS,
};
export default {
  getEffectiveGoalTypes,
  upsertGoalPreference,
  resetGoalPreference,
  renameGoalPreferenceKey,
  BUILTIN_MAXIMUM_DEFAULTS,
};
