import { tool } from 'ai';
import { z } from 'zod';
import { addDays, todayInZone } from '@workspace/shared';
import { log } from '../../config/logging.js';
import foodCoreService from '../../services/foodCoreService.js';
import foodEntryService from '../../services/foodEntryService.js';
import mealService from '../../services/mealService.js';
import preferenceService from '../../services/preferenceService.js';
import measurementService from '../../services/measurementService.js';
import {
  searchProviderFoods,
  type ProviderType,
} from '../../services/externalFoodSearchService.js';
import foodRepository from '../../models/foodRepository.js';
import foodEntryMealRepository from '../../models/foodEntryMealRepository.js';
import measurementRepository from '../../models/measurementRepository.js';
import reportRepository from '../../models/reportRepository.js';
import externalProviderRepository from '../../models/externalProviderRepository.js';
import { ERRORS, formatZodError } from './errors.js';
import {
  compactRecord,
  dayString,
  formatConfirmation,
  formatJsonResult,
  formatList,
} from './formatting.js';
import {
  normalizePagination,
  buildPaginatedResult,
  type PaginatedResult,
} from './pagination.js';
import { convertEnergy } from './unitConversion.js';
import {
  manageFoodSchema,
  manageFoodInput,
  type ManageFoodInput,
} from './schemas/food.js';
import { optionalDateSchema, uuidSchema } from './schemas/common.js';
import { normalizeActionArgs, normalizeDayKeywords } from './dates.js';
import { normalizeServingUnit } from '../../utils/foodUtils.js';

const VALID_ACTIONS = [
  'search_food',
  'lookup_food_nutrition',
  'log_food',
  'log_external_food',
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
];

// Provider types the no-provider cascade may search (exercise/health
// providers are excluded).
const FOOD_PROVIDER_TYPES = [
  'fatsecret',
  'mealie',
  'tandoor',
  'norish',
  'usda',
  'openfoodfacts',
];

// Units where an omitted create_food quantity defaults to 1 instead of 100.
const COUNT_BASED_UNITS = [
  'serving',
  'piece',
  'slice',
  'portion',
  'unit',
  'can',
  'bottle',
  'item',
  'pack',
];

// Window for tool-layer exact-name matching over the server's substring
// search. An exact match could fall outside it only when more than this many
// foods contain the searched name as a substring.
const NAME_RESOLUTION_WINDOW = 500;

// Optional inputs and nullable DB columns are treated alike: absent.
function isSet<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

// Serving units that signal a data-entry error rather than a real food
// serving (a food portion measured in milli/microgram is almost always
// mislabeled branded data). Variants using them are demoted when picking the
// one to show/log.
const IMPLAUSIBLE_SERVING_UNITS = new Set(['mg', 'mcg', 'µg', 'ug']);

// Picks the variant to surface for an external provider match. Providers
// (USDA especially) sometimes mark a nonsensical variant as default — e.g. a
// "28 mg" serving on a branded item — so prefer a variant with a plausible
// serving unit and positive size, keeping the provider's default only as a
// tiebreak within the sane set.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickBestVariant(food: any) {
  const variants: any[] = (
    food?.variants?.length ? food.variants : [food?.default_variant]
  ).filter(Boolean);
  if (variants.length === 0) return food?.default_variant ?? null;
  const isPlausible = (v: any) =>
    Number(v.serving_size) > 0 &&
    !IMPLAUSIBLE_SERVING_UNITS.has(String(v.serving_unit || '').toLowerCase());
  const pool = variants.filter(isPlausible);
  const chosen = pool.length > 0 ? pool : variants;
  return chosen.find((v) => v.is_default) ?? chosen[0];
}

// Re-ranks external provider matches so generic/whole foods win over branded
// products. Providers return branded items ("EGG (SNICKERS)", "BANANA
// (BETTER'N PEANUT BUTTER)") ahead of the plain whole food a user almost
// always means, and small models just take the first result. Stable within
// each tier so the provider's own relevance order is otherwise preserved.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rankProviderMatches(foods: any[], query: string): any[] {
  const q = query.trim().toLowerCase();
  const qStem = q.replace(/s$/, '');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const score = (f: any): number => {
    const name = String(f?.name ?? '').toLowerCase();
    const branded = Boolean(f?.brand && String(f.brand).trim());
    const firstSegment = name.split(',')[0].trim();
    let s = branded ? 0 : 100; // whole foods first
    if (firstSegment === q || firstSegment === qStem) s += 20;
    else if (firstSegment.startsWith(qStem)) s += 10;
    else if (name.includes(q)) s += 5;
    return s;
  };
  return foods
    .map((f, i) => ({ f, i, s: score(f) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.f);
}

// Provider nutrition values arrive as strings or numbers; absent/blank/NaN
// all normalize to null so createFood stores them as empty, not 0.
function toNutrientNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

// Placeholder values for corrective retry examples (see
// formatActionParseError). Date-like fields resolve to today at call time.
const FIELD_EXAMPLE_VALUES: Record<string, unknown> = {
  food_name: 'banana',
  meal_type: 'breakfast',
  quantity: 1,
  unit: 'serving',
  amount_ml: 250,
  calories: 100,
  protein: 1,
  carbs: 20,
  fat: 0.5,
  search_type: 'broad',
  meal_name: 'My Meal',
  entry_type: 'food_entry',
  entry_id: '<entry UUID from list_diary>',
  food_id: '<internal food UUID>',
  meal_id: '<meal UUID from search_meal>',
};

function unionOptionForAction(action: string) {
  return manageFoodSchema.options.find(
    (o) => o.shape.action.safeParse(action).success
  );
}

// Renders a failed per-action parse as a corrective error: the field problems
// plus a complete retry example built from the model's own valid args and
// placeholders for missing required fields. Small local models recover from a
// copyable example far more often than from a bare Zod trace.
function formatActionParseError(
  action: string,
  error: z.ZodError,
  args: Record<string, unknown>,
  tz: string
): string {
  const option = unionOptionForAction(action);
  if (!option) {
    return ERRORS.INVALID_ACTION(action, VALID_ACTIONS);
  }
  const example: Record<string, unknown> = { action };
  for (const [key, fieldSchema] of Object.entries(option.shape)) {
    if (key === 'action') continue;
    const schema = fieldSchema as z.ZodType;
    const provided = args[key];
    if (provided !== undefined && schema.safeParse(provided).success) {
      example[key] = provided;
    } else if (!schema.safeParse(undefined).success) {
      // Required and missing/invalid: fill with a placeholder.
      example[key] = key.includes('date')
        ? todayInZone(tz)
        : (FIELD_EXAMPLE_VALUES[key] ?? `<${key}>`);
    }
  }
  const issues = error.issues
    .map((i) =>
      i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message
    )
    .join('; ');
  return ERRORS.VALIDATION(
    `${action} call was invalid — ${issues}. Retry sparky_manage_food with all required fields, for example: ${JSON.stringify(example)}`
  );
}

// MCP's date-range defaults: a single `date` overrides start/end; otherwise
// the range defaults to today (user timezone) / the start date.
function foodDateRange(
  query: {
    date?: string;
    start_date?: string;
    end_date?: string;
  },
  tz: string
): { startDate: string; endDate: string } {
  const today = todayInZone(tz);
  const date = query.date || undefined;
  const startDate = date || query.start_date || today;
  const endDate = date || query.end_date || startDate;
  return { startDate, endDate };
}

// The variant column set MCP's food search exposed; the server's
// default_variant JSON is projected down to it.
function projectVariant(foodId: string, v: any) {
  const result: Record<string, any> = {
    id: v.id,
    food_id: foodId,
    serving_size: v.serving_size,
    serving_unit: v.serving_unit,
    calories: v.calories,
    protein: v.protein,
    carbs: v.carbs,
    fat: v.fat,
  };

  const optionalFields = [
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
    'glycemic_index',
  ];

  for (const field of optionalFields) {
    const val = v[field];
    if (
      val !== undefined &&
      val !== null &&
      val !== 0 &&
      val !== '0' &&
      val !== 'None'
    ) {
      result[field] = val;
    }
  }

  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function projectFoodItem(row: any) {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand || undefined,
    variants: row.default_variant?.id
      ? [projectVariant(row.id, row.default_variant)]
      : [],
  };
}

// `user_id` is the authenticated caller on every row; never useful in output.
const CATALOG_FOOD_DROP = ['user_id'] as const;
const VARIANT_DROP = ['user_id'] as const;
// food_entries internal surrogate keys with a human-readable equivalent already
// present (meal_type label, serving_size/serving_unit) or no model use. `id`
// (for edit/delete) and `food_id` (for food lookups / re-logging) are kept.
const DIARY_ENTRY_DROP = [
  'meal_type_id',
  'variant_id',
  'meal_plan_template_id',
  'food_entry_meal_id',
] as const;
// food_entry_meals (SELECT fem.*) audit/ownership/internal columns.
const DIARY_MEAL_DROP = [
  'user_id',
  'created_at',
  'updated_at',
  'created_by_user_id',
  'updated_by_user_id',
  'meal_template_id',
  'meal_type_id',
  'legacy_serving_unit_math',
] as const;
// Full food_entries dumps (`SELECT fe.*`, used by recent-entries and food-usage)
// add audit/ownership columns on top of the diary projection's surrogate keys.
const FULL_ENTRY_DROP: readonly string[] = [
  ...DIARY_ENTRY_DROP,
  'user_id',
  'created_at',
  'updated_at',
  'created_by_user_id',
  'updated_by_user_id',
];

// Catalog row for the JSON helpers: the server's default_variant JSON is
// folded into MCP's `variants` array shape, both compacted.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function projectCatalogFood(row: any) {
  const { default_variant: defaultVariant, ...rest } = row;
  return {
    ...compactRecord(rest, CATALOG_FOOD_DROP),
    variants: defaultVariant?.id
      ? [compactRecord(defaultVariant, VARIANT_DROP)]
      : [],
  };
}

// Internal food search mirroring MCP's searchFood: "broad" is a substring
// match, "exact" a case-insensitive name-equality filter applied in the tool
// layer over the server's substring search.
async function searchFoodInternal(
  userId: string,
  foodName: string,
  searchType: 'exact' | 'broad',
  limitArg?: number,
  offsetArg?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<PaginatedResult<any>> {
  const { limit, offset } = normalizePagination(limitArg, offsetArg);
  if (searchType === 'exact') {
    const rows = await foodRepository.getFoodsWithPagination(
      foodName,
      null,
      userId,
      NAME_RESOLUTION_WINDOW,
      0,
      null
    );
    const matches = rows.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => String(r.name).toLowerCase() === foodName.toLowerCase()
    );
    return buildPaginatedResult(
      matches.slice(offset, offset + limit).map(projectFoodItem),
      matches.length,
      offset
    );
  }
  const [rows, totalCount] = await Promise.all([
    foodRepository.getFoodsWithPagination(
      foodName,
      null,
      userId,
      limit,
      offset,
      null
    ),
    foodRepository.countFoods(foodName, null, userId),
  ]);
  return buildPaginatedResult(rows.map(projectFoodItem), totalCount, offset);
}

// Case-insensitive exact name lookup (MCP's `name ILIKE $1` without
// wildcards). Returns the raw catalog row including default_variant.
async function findFoodByExactName(userId: string, name: string) {
  const rows = await foodRepository.getFoodsWithPagination(
    name,
    null,
    userId,
    NAME_RESOLUTION_WINDOW,
    0,
    null
  );
  return rows.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: any) => String(r.name).toLowerCase() === name.toLowerCase()
  );
}

// Per-day nutrition totals with the user's energy-unit conversion applied —
// MCP's getNutritionalSummary row shape (fiber/sugar aliases included).
// Shared with the report tools.
export async function getNutritionalSummaryRows(
  userId: string,
  startDate: string,
  endDate: string
) {
  const prefs = await preferenceService.getUserPreferences(userId, userId);
  const energyUnit = (prefs?.energy_unit as string) || 'kcal';
  const rows = await reportRepository.getDailyNutritionTotalsRange(
    userId,
    startDate,
    endDate
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((row: any) => {
    const calories = Number(row.calories || 0);
    return {
      entry_date: dayString(row.entry_date),
      calories:
        energyUnit === 'kJ' ? convertEnergy(calories, 'kcal', 'kJ') : calories,
      protein: Number(row.protein || 0),
      carbs: Number(row.carbs || 0),
      fat: Number(row.fat || 0),
      saturated_fat: Number(row.saturated_fat || 0),
      polyunsaturated_fat: Number(row.polyunsaturated_fat || 0),
      monounsaturated_fat: Number(row.monounsaturated_fat || 0),
      trans_fat: Number(row.trans_fat || 0),
      cholesterol: Number(row.cholesterol || 0),
      sodium: Number(row.sodium || 0),
      potassium: Number(row.potassium || 0),
      fiber: Number(row.fiber || 0),
      sugar: Number(row.sugar || 0),
      vitamin_a: Number(row.vitamin_a || 0),
      vitamin_c: Number(row.vitamin_c || 0),
      calcium: Number(row.calcium || 0),
      iron: Number(row.iron || 0),
      energy_unit: energyUnit,
    };
  });
}

// Per-day water totals converted into the user's display unit — MCP's
// getWaterHistory row shape. Shared with the report tools.
export async function getWaterHistoryRows(
  userId: string,
  startDate?: string,
  endDate?: string
) {
  const prefs = await preferenceService.getUserPreferences(userId, userId);
  const waterUnit = (prefs?.water_display_unit as string) || 'ml';
  const rows = await measurementRepository.getWaterTotalsByDateRange(
    userId,
    startDate,
    endDate
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((row: any) => {
    const ml = Number(row.total_ml || 0);
    return {
      entry_date: dayString(row.entry_date),
      amount: waterUnit === 'oz' ? Math.round((ml / 29.5735) * 10) / 10 : ml,
      unit: waterUnit,
    };
  });
}

/**
 * Cascade lookup for food nutrition: internal DB, then the user's active
 * configured external providers (sort_order first), then free OpenFoodFacts.
 * `source: 'ai_estimate'` with a null food signals the AI-estimation fallback.
 */
async function lookupFoodNutrition(
  userId: string,
  foodName: string,
  providerType?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ source: string; food: any | null; alternatives?: any[] }> {
  // Internal DB search (unless another provider was explicitly requested)
  if (!providerType || providerType === 'internal') {
    const internalExact = await searchFoodInternal(userId, foodName, 'exact');
    if (internalExact.data.length > 0) {
      return {
        source: 'internal',
        food: internalExact.data[0],
        alternatives: internalExact.data.slice(1),
      };
    }
    const internalBroad = await searchFoodInternal(userId, foodName, 'broad');
    if (internalBroad.data.length > 0) {
      return {
        source: 'internal',
        food: internalBroad.data[0],
        alternatives: internalBroad.data.slice(1),
      };
    }
    // "internal" explicitly requested and not found: stop here
    if (providerType === 'internal') {
      return { source: 'internal', food: null };
    }
  }

  let targetProviders: {
    id?: string;
    provider_type: string;
    provider_name: string;
  }[] = [];

  if (providerType) {
    if (providerType === 'openfoodfacts') {
      targetProviders.push({
        provider_type: 'openfoodfacts',
        provider_name: 'OpenFoodFacts',
      });
    } else {
      const rows = await externalProviderRepository.getActiveProvidersByTypes(
        userId,
        [providerType]
      );
      if (rows.length > 0) {
        targetProviders.push(rows[0]);
      } else {
        // Explicitly requested but unconfigured: the per-provider search
        // below fails (no credentials) and the cascade falls through to the
        // AI-estimate response — MCP behavior, pinned by test.
        targetProviders.push({
          provider_type: providerType,
          provider_name: providerType,
        });
      }
    }
  } else {
    targetProviders =
      await externalProviderRepository.getActiveProvidersByTypes(
        userId,
        FOOD_PROVIDER_TYPES
      );
    if (!targetProviders.some((p) => p.provider_type === 'openfoodfacts')) {
      targetProviders.push({
        provider_type: 'openfoodfacts',
        provider_name: 'OpenFoodFacts',
      });
    }
  }

  for (const provider of targetProviders) {
    try {
      log(
        'debug',
        `[Food Tool] Lookup cascade querying provider: ${provider.provider_name} (${provider.provider_type})`
      );
      const result = await searchProviderFoods(
        userId,
        provider.provider_type as ProviderType,
        foodName,
        { providerId: provider.id }
      );
      if (result.foods.length > 0) {
        const ranked = rankProviderMatches(result.foods, foodName);
        return {
          source: provider.provider_type,
          food: ranked[0],
          alternatives: ranked.slice(1),
        };
      }
    } catch (error) {
      log(
        'warn',
        `[Food Tool] Lookup cascade provider ${provider.provider_name} failed:`,
        error
      );
    }
  }

  return { source: 'ai_estimate', food: null };
}

// Standalone domain tools.
const foodDateRangeSchema = z.object({
  date: optionalDateSchema,
  start_date: optionalDateSchema,
  end_date: optionalDateSchema,
});

const foodPaginationSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
});

const listFoodsSchema = foodPaginationSchema.extend({
  search: z.string().optional(),
});

const getFoodDetailsSchema = z.object({
  food_id: z.string().min(1),
});

const searchFoodsSchema = foodPaginationSchema.extend({
  query: z.string().min(1),
});

const recentFoodEntriesSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
});

const foodUsageSchema = foodDateRangeSchema.merge(foodPaginationSchema).extend({
  food_id: z.string().min(1),
});

export function buildFoodTools(userId: string, tz: string) {
  return {
    sparky_manage_food: tool({
      description: `Nutrition tracking: search food, log meals, create foods, manage diary.

Actions:
- search_food(food_name, search_type:"exact"|"broad", limit?, offset?)
- lookup_food_nutrition(food_name, provider_type?) — AI MUST call this cascade lookup first before creating or estimating a food. Bypasses regular cascade to search specific provider (e.g. openfoodfacts, usda) if provider_type given.
- log_food(quantity, meal_type:"breakfast"|"lunch"|"dinner"|"snacks", food_name?|food_id?, unit?, entry_date?, variant_id?) — provide food_name or food_id (an internal food UUID, never a lookup result's External ID); unit defaults to the food's serving unit, entry_date defaults to today. Works only for foods already in the database (source='internal').
- log_external_food(food_name, meal_type, quantity?, unit?, entry_date?, external_id?, provider_type?) — PREFERRED way to log an external lookup_food_nutrition match (usda/openfoodfacts/...): the server re-fetches the provider result, saves it with full nutrition, and logs it in one call. quantity is in servings and defaults to 1.
- create_food(food_name, calories, protein, carbs, fat, brand?, quantity?, unit?, meal_type?, entry_date?, saturated_fat?, fiber?, sugar?, sodium?, ...) — MANDATORY: You must run lookup_food_nutrition first. Call only when lookup returns source='ai_estimate' (no match anywhere) or for custom/homemade foods, using AI-estimated values; for external lookup matches use log_external_food instead. Include meal_type + entry_date to also log the food in the same call. Populate as many micro-nutrients, GI classification, and brand ('Homemade' or 'Traditional' if generic) as possible rather than just core macros.
- search_meal(meal_name)
- log_meal(meal_type, entry_date, meal_id?, meal_name?, quantity?)
- list_diary(entry_date?)
- delete_entry(entry_id, entry_type:"food_entry"|"food_entry_meal")
- delete_food(food_id?|food_name?) — deletes food + variants + all diary entries referencing it
- update_entry(entry_id, entry_type, quantity, unit)
- update_food_variant(food_id?|variant_id?, serving_size?, serving_unit?, calories?, protein?, carbs?, fat?, saturated_fat?, fiber?, sugar?, sodium?, ..., update_existing_entries?) — updates an existing food variant without deleting the food. Defaults to leaving existing diary entries unchanged.
- copy_from_yesterday(target_date?, source_date?, meal_type?)
- save_as_meal_template(entry_date, meal_type, meal_name, description?)
- log_water(amount_ml, entry_date)
- get_nutritional_summary(start_date, end_date) — returns macro breakdown for a range of dates
- get_water_history(start_date?, end_date?)`,
      inputSchema: manageFoodInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs,
          tz,
          VALID_ACTIONS,
          (args) => {
            if (args.amount_ml) {
              return 'log_water';
            }
            if (args.external_id) {
              return 'log_external_food';
            }
            if (
              (args.food_name || args.food_id) &&
              args.quantity &&
              args.meal_type
            ) {
              if (
                args.food_name?.toLowerCase() === 'water' ||
                args.unit === 'ml'
              ) {
                return 'log_water';
              }
              return 'log_food';
            }
            if (
              args.food_name &&
              (args.calories !== undefined || args.protein !== undefined)
            ) {
              return 'create_food';
            }
            if (args.food_name) {
              return 'lookup_food_nutrition';
            }
            if (args.meal_name) {
              return 'search_meal';
            }
            if (args.meal_id || args.meal_type) {
              return 'log_meal';
            }
            if (args.entry_id && args.quantity) {
              return 'update_entry';
            }
            if (args.entry_id && args.entry_type) {
              return 'delete_entry';
            }
            if (args.food_id) {
              return 'delete_food';
            }
            if (args.target_date || args.source_date) {
              return 'copy_from_yesterday';
            }
            if (args.start_date || args.end_date) {
              return 'get_nutritional_summary';
            }
            if (args.entry_date) {
              return 'list_diary';
            }
            return 'list_diary'; // fallback
          }
        ) as Record<string, any>;

        // Models routinely paste a lookup result's provider "External ID"
        // into food_id, which must be an internal UUID. When the food_name is
        // also present, drop the bad id and resolve by name (log_food's
        // normal path); otherwise return a chat-visible correction instead of
        // letting the strict union emit a bare "Must be a valid UUID".
        if (
          typeof normalized.food_id === 'string' &&
          !uuidSchema.safeParse(normalized.food_id).success
        ) {
          if (normalized.food_name) {
            log(
              'info',
              `[foodTools] Ignoring non-UUID food_id '${normalized.food_id}' (likely a provider External ID); resolving by food_name`
            );
            delete normalized.food_id;
          } else {
            return ERRORS.VALIDATION(
              `food_id '${normalized.food_id}' is not an internal food UUID — External IDs from lookup_food_nutrition results cannot be logged directly. Retry with log_external_food, passing the food_name (and optionally external_id '${normalized.food_id}') plus quantity and meal_type.`
            );
          }
        }

        // Same trap for variant_id; dropping it falls back to the default
        // variant, which is what the model wanted anyway.
        if (
          typeof normalized.variant_id === 'string' &&
          !uuidSchema.safeParse(normalized.variant_id).success
        ) {
          log(
            'info',
            `[foodTools] Ignoring non-UUID variant_id '${normalized.variant_id}'; using the default variant`
          );
          delete normalized.variant_id;
        }
        const loggingActions = [
          'log_food',
          'log_external_food',
          'create_food',
          'log_meal',
          'log_water',
          'save_as_meal_template',
        ];
        // Small-model salvage: a date supplied under the wrong key on a
        // logging action (source_date/target_date belong to
        // copy_from_yesterday) becomes entry_date instead of an
        // unrecognized-key failure.
        if (loggingActions.includes(normalized.action)) {
          const misfiled = normalized.source_date || normalized.target_date;
          if (misfiled && !normalized.entry_date) {
            normalized.entry_date = misfiled;
            log(
              'info',
              `[foodTools] Remapped misfiled date '${misfiled}' to entry_date for ${normalized.action}`
            );
          }
          delete normalized.source_date;
          delete normalized.target_date;
        }
        // Default missing entry_date to 'today' for logging actions
        if (
          !process.env.VITEST &&
          !normalized.entry_date &&
          loggingActions.includes(normalized.action)
        ) {
          normalized.entry_date = 'today';
        }

        let parsed = manageFoodSchema.safeParse(normalized);
        if (!parsed.success) {
          // Small-model salvage: drop keys the action doesn't accept (models
          // bleed fields across actions) and re-parse once.
          const badKeys = parsed.error.issues.flatMap((i) =>
            i.code === 'unrecognized_keys' ? i.keys : []
          );
          if (badKeys.length > 0) {
            for (const key of badKeys) delete normalized[key];
            log(
              'info',
              `[foodTools] Dropped unrecognized keys for ${normalized.action}: ${badKeys.join(', ')}`
            );
            parsed = manageFoodSchema.safeParse(normalized);
          }
        }
        if (!parsed.success) {
          return formatActionParseError(
            String(normalized.action),
            parsed.error,
            normalized,
            tz
          );
        }
        const args: ManageFoodInput = parsed.data;
        try {
          switch (args.action) {
            case 'search_food': {
              const result = await searchFoodInternal(
                userId,
                args.food_name,
                args.search_type,
                args.limit,
                args.offset
              );
              return formatList(
                result.data,
                `Food Search: "${args.food_name}" (${args.search_type})`,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (f: any) => {
                  const v = f.variants[0];
                  let text = `**${f.name}**`;
                  if (f.brand) text += ` (${f.brand})`;
                  if (v) {
                    text += `\n  ${v.serving_size}${v.serving_unit}: ${v.calories} kcal | P: ${v.protein}g | C: ${v.carbs}g | F: ${v.fat}g`;
                  }
                  text += `\n  ID: ${f.id}`;
                  if (v) text += ` | Variant: ${v.id}`;
                  return text;
                },
                {
                  total_count: result.total_count,
                  has_more: result.has_more,
                  next_offset: result.next_offset,
                }
              );
            }

            case 'lookup_food_nutrition': {
              const result = await lookupFoodNutrition(
                userId,
                args.food_name,
                args.provider_type
              );

              if (result.source === 'ai_estimate') {
                return `No matches found in internal DB or configured external databases/OpenFoodFacts for "${args.food_name}". You may estimate the nutrition using AI and save it using create_food.`;
              }
              if (!result.food) {
                // MCP quirk: an explicit provider_type='internal' miss
                // crashed its renderer on the null food and surfaced as a
                // DB error — ported as-is.
                return ERRORS.DB_ERROR();
              }

              const f = result.food;
              let text = `### Found match in **${result.source}**:\n`;
              text += `**${f.name}**`;
              if (f.brand) text += ` (${f.brand})`;

              if (result.source === 'internal') {
                const dbVariants = await foodRepository.getFoodVariantsByFoodId(
                  f.id,
                  userId
                );
                if (Array.isArray(dbVariants)) {
                  f.variants = dbVariants;
                }
              }

              const v =
                result.source === 'internal'
                  ? f.default_variant || f.variants?.[0]
                  : pickBestVariant(f);
              if (v) {
                text += `\n  Serving Size: ${v.serving_size} ${v.serving_unit}`;
                text += `\n  Energy: ${v.calories ?? v.energy ?? 0} kcal`;
                text += `\n  Macros: Protein: ${v.protein}g | Carbs: ${v.carbs}g | Fat: ${v.fat}g`;
                if (
                  isSet(v.saturated_fat) ||
                  isSet(v.dietary_fiber) ||
                  isSet(v.sugars) ||
                  isSet(v.sodium)
                ) {
                  text += `\n  Details: Fiber: ${v.dietary_fiber ?? 0}g | Sugar: ${v.sugars ?? 0}g | Sodium: ${v.sodium ?? 0}mg | SatFat: ${v.saturated_fat ?? 0}g`;
                }

                const plausibleVariants = (f.variants || []).filter(
                  (vOpt: any) =>
                    vOpt &&
                    Number(vOpt.serving_size) > 0 &&
                    !IMPLAUSIBLE_SERVING_UNITS.has(
                      String(vOpt.serving_unit || '').toLowerCase()
                    )
                );
                if (plausibleVariants.length > 0) {
                  const units = plausibleVariants
                    .map(
                      (vOpt: any) => `${vOpt.serving_size} ${vOpt.serving_unit}`
                    )
                    .join(', ');
                  text += `\n  Available Serving Units: ${units}`;
                } else {
                  text += `\n  Available Serving Units: ${v.serving_size} ${v.serving_unit}`;
                }

                // Internal hits carry a usable food UUID; surface it so the
                // model can call log_food(food_id) directly.
                if (result.source === 'internal' && f.id) {
                  text += `\n  ID: ${f.id}`;
                }
                if (f.provider_external_id) {
                  text += `\n  External ID: ${f.provider_external_id}`;
                }
              }

              if (result.alternatives && result.alternatives.length > 0) {
                text += '\n\n**Other Alternatives found:**';
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                result.alternatives.slice(0, 5).forEach((alt: any) => {
                  const altV =
                    result.source === 'internal'
                      ? alt.default_variant || alt.variants?.[0]
                      : pickBestVariant(alt);
                  text += `\n- **${alt.name}**`;
                  if (alt.brand) text += ` (${alt.brand})`;
                  if (altV) {
                    text += ` (${altV.serving_size}${altV.serving_unit}: ${altV.calories ?? altV.energy ?? 0} kcal)`;
                  }
                });
              }

              // External-provider results are not yet in the user's food
              // database, and their External ID is not a food_id. The hint is
              // a literal, filled-in example call: small local models copy an
              // example far more reliably than they carry the food name and
              // nutrition values across turns into their own call.
              if (result.source !== 'internal') {
                const exampleCall = JSON.stringify({
                  action: 'log_external_food',
                  food_name: f.name,
                  ...(f.provider_external_id
                    ? { external_id: String(f.provider_external_id) }
                    : {}),
                  quantity: 1,
                  meal_type: '<breakfast|lunch|dinner|snacks>',
                });
                text += `\n\nNote: this external result is not saved in the food database yet. To save and log it in one step, call sparky_manage_food with: ${exampleCall} (adjust quantity and meal_type). Do NOT pass the External ID as food_id.`;
              }

              return text;
            }

            case 'log_food': {
              let foodId = args.food_id;
              let variantId = args.variant_id;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let foodRow: any;
              if (!foodId) {
                if (!args.food_name) {
                  return ERRORS.MISSING_PARAMS(['food_name (or food_id)']);
                }
                foodRow = await findFoodByExactName(userId, args.food_name);
                if (!foodRow) {
                  return ERRORS.VALIDATION(
                    `Food "${args.food_name}" not found in the database. Call lookup_food_nutrition first to search external providers, for example: {"action":"lookup_food_nutrition","food_name":"${args.food_name}"}. If it returns an external match, log it with log_external_food; otherwise call create_food with estimated macros.`
                  );
                }
                foodId = foodRow.id;
              }
              const food =
                foodRow ?? (await foodRepository.getFoodById(foodId, userId));
              let unit =
                args.unit || food?.default_variant?.serving_unit || 'serving';
              if (!variantId) {
                variantId = food?.default_variant?.id;
                if (args.unit) {
                  const variants = await foodRepository.getFoodVariantsByFoodId(
                    foodId,
                    userId
                  );
                  if (Array.isArray(variants)) {
                    const normalizedReqUnit = normalizeServingUnit(args.unit);
                    const matchedVariant = variants.find(
                      (v: any) =>
                        normalizeServingUnit(v.serving_unit) ===
                        normalizedReqUnit
                    );
                    if (matchedVariant) {
                      variantId = matchedVariant.id;
                      unit = matchedVariant.serving_unit;
                    }
                  }
                }
              }
              const entryDate = args.entry_date || todayInZone(tz);
              const entry = await foodEntryService.createFoodEntry(
                userId,
                userId,
                {
                  user_id: userId,
                  food_id: foodId,
                  variant_id: variantId,
                  entry_date: entryDate,
                  quantity: args.quantity,
                  unit,
                  meal_type: args.meal_type,
                }
              );
              return formatConfirmation(
                `Logged "${entry.food_name}" (${args.quantity} ${unit}) for ${args.meal_type} on ${entryDate}.`
              );
            }

            case 'log_external_food': {
              const entryDate = args.entry_date || todayInZone(tz);
              const quantity = args.quantity ?? 1;
              const result = await lookupFoodNutrition(
                userId,
                args.food_name,
                args.provider_type
              );
              if (result.source === 'ai_estimate' || !result.food) {
                return ERRORS.VALIDATION(
                  `No external match found for "${args.food_name}". Please estimate the nutrition yourself and call create_food (include meal_type and entry_date to save and log in one step), for example: {"action":"create_food","food_name":"${args.food_name}","calories":300,"protein":15,"carbs":40,"fat":5,"meal_type":"${args.meal_type || 'lunch'}"}`
                );
              }
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const candidates: any[] = [
                result.food,
                ...(result.alternatives ?? []),
              ];
              const match =
                (args.external_id &&
                  candidates.find(
                    (c) =>
                      String(c.provider_external_id ?? '') ===
                      String(args.external_id)
                  )) ||
                result.food;

              if (result.source === 'internal') {
                // Already saved: log it directly against the existing food.
                const variants = await foodRepository.getFoodVariantsByFoodId(
                  match.id,
                  userId
                );
                let variantId =
                  match.default_variant?.id || match.variants?.[0]?.id;
                let unit =
                  args.unit ||
                  match.default_variant?.serving_unit ||
                  match.variants?.[0]?.serving_unit ||
                  'serving';
                if (args.unit && Array.isArray(variants)) {
                  const normalizedReqUnit = normalizeServingUnit(args.unit);
                  const matchedVariant = variants.find(
                    (v: any) =>
                      normalizeServingUnit(v.serving_unit) === normalizedReqUnit
                  );
                  if (matchedVariant) {
                    variantId = matchedVariant.id;
                    unit = matchedVariant.serving_unit;
                  }
                }
                const entry = await foodEntryService.createFoodEntry(
                  userId,
                  userId,
                  {
                    user_id: userId,
                    food_id: match.id,
                    variant_id: variantId,
                    entry_date: entryDate,
                    quantity,
                    unit,
                    meal_type: args.meal_type,
                  }
                );
                return formatConfirmation(
                  `"${entry.food_name}" was already in the food database — logged ${quantity} ${unit} for ${args.meal_type} on ${entryDate}.`
                );
              }

              const v = pickBestVariant(match);
              if (!v) {
                return ERRORS.VALIDATION(
                  `Provider result for "${match.name}" has no nutrition data. Use create_food with estimated nutrition values instead.`
                );
              }
              const food = await foodCoreService.createFood(userId, {
                user_id: userId,
                name: match.name,
                brand: match.brand || null,
                serving_size: toNutrientNumber(v.serving_size) ?? 100,
                serving_unit: v.serving_unit || 'g',
                calories: toNutrientNumber(v.calories ?? v.energy) ?? 0,
                protein: toNutrientNumber(v.protein) ?? 0,
                carbs: toNutrientNumber(v.carbs) ?? 0,
                fat: toNutrientNumber(v.fat) ?? 0,
                saturated_fat: toNutrientNumber(v.saturated_fat),
                polyunsaturated_fat: toNutrientNumber(v.polyunsaturated_fat),
                monounsaturated_fat: toNutrientNumber(v.monounsaturated_fat),
                trans_fat: toNutrientNumber(v.trans_fat),
                cholesterol: toNutrientNumber(v.cholesterol),
                sodium: toNutrientNumber(v.sodium),
                potassium: toNutrientNumber(v.potassium),
                dietary_fiber: toNutrientNumber(v.dietary_fiber),
                sugars: toNutrientNumber(v.sugars),
                vitamin_a: toNutrientNumber(v.vitamin_a),
                vitamin_c: toNutrientNumber(v.vitamin_c),
                calcium: toNutrientNumber(v.calcium),
                iron: toNutrientNumber(v.iron),
                glycemic_index: v.glycemic_index || null,
                source: result.source,
              });

              // Create the other variants returned by the provider
              const otherVariants = (match.variants || []).filter(
                (varOpt: any) =>
                  varOpt !== v &&
                  (varOpt.serving_size !== v.serving_size ||
                    varOpt.serving_unit !== v.serving_unit)
              );
              let createdVariants: any[] = [];
              if (otherVariants.length > 0) {
                const variantsToSave = otherVariants.map((varOpt: any) => ({
                  food_id: food.id,
                  serving_size: toNutrientNumber(varOpt.serving_size) ?? 100,
                  serving_unit: varOpt.serving_unit || 'g',
                  calories:
                    toNutrientNumber(varOpt.calories ?? varOpt.energy) ?? 0,
                  protein: toNutrientNumber(varOpt.protein) ?? 0,
                  carbs: toNutrientNumber(varOpt.carbs) ?? 0,
                  fat: toNutrientNumber(varOpt.fat) ?? 0,
                  saturated_fat: toNutrientNumber(varOpt.saturated_fat),
                  polyunsaturated_fat: toNutrientNumber(
                    varOpt.polyunsaturated_fat
                  ),
                  monounsaturated_fat: toNutrientNumber(
                    varOpt.monounsaturated_fat
                  ),
                  trans_fat: toNutrientNumber(varOpt.trans_fat),
                  cholesterol: toNutrientNumber(varOpt.cholesterol),
                  sodium: toNutrientNumber(varOpt.sodium),
                  potassium: toNutrientNumber(varOpt.potassium),
                  dietary_fiber: toNutrientNumber(varOpt.dietary_fiber),
                  sugars: toNutrientNumber(varOpt.sugars),
                  vitamin_a: toNutrientNumber(varOpt.vitamin_a),
                  vitamin_c: toNutrientNumber(varOpt.vitamin_c),
                  calcium: toNutrientNumber(varOpt.calcium),
                  iron: toNutrientNumber(varOpt.iron),
                  glycemic_index: varOpt.glycemic_index || null,
                  is_default: false,
                  source: result.source,
                }));
                try {
                  createdVariants =
                    await foodCoreService.bulkCreateFoodVariants(
                      userId,
                      variantsToSave
                    );
                } catch (err) {
                  log(
                    'warn',
                    '[Food Tool] Failed to bulk save alternative variants:',
                    err
                  );
                }
              }

              const dv = food.default_variant;
              let variantId = dv?.id;
              let unit = args.unit || 'serving';

              if (args.unit) {
                const normalizedReqUnit = normalizeServingUnit(args.unit);
                const matchedAlt = createdVariants.find(
                  (cv: any) =>
                    normalizeServingUnit(cv.serving_unit) === normalizedReqUnit
                );
                if (matchedAlt) {
                  variantId = matchedAlt.id;
                  unit = matchedAlt.serving_unit;
                } else if (
                  dv &&
                  normalizeServingUnit(dv.serving_unit) === normalizedReqUnit
                ) {
                  variantId = dv.id;
                  unit = dv.serving_unit;
                }
              }

              await foodEntryService.createFoodEntry(userId, userId, {
                user_id: userId,
                food_id: food.id,
                variant_id: variantId,
                entry_date: entryDate,
                quantity,
                unit,
                meal_type: args.meal_type,
              });
              return formatConfirmation(
                `Saved "${food.name}" from ${result.source} (${dv?.calories || 0} kcal per ${dv?.serving_size || 100}${dv?.serving_unit || 'g'}) and logged ${quantity} ${unit} to ${args.meal_type} on ${entryDate}.`
              );
            }

            case 'create_food': {
              const targetUnit = args.unit || 'serving';
              const isCountUnit = COUNT_BASED_UNITS.includes(
                targetUnit.toLowerCase()
              );
              const targetQuantity = args.quantity || (isCountUnit ? 1 : 100);
              // The `|| null` on optional fields is MCP's storage quirk
              // (an explicit 0 is stored as null), ported as-is.
              const food = await foodCoreService.createFood(userId, {
                user_id: userId,
                name: args.food_name,
                brand: args.brand || null,
                serving_size: targetQuantity,
                serving_unit: targetUnit,
                calories: args.calories,
                protein: args.protein,
                carbs: args.carbs,
                fat: args.fat,
                saturated_fat: args.saturated_fat || null,
                polyunsaturated_fat: args.polyunsaturated_fat || null,
                monounsaturated_fat: args.monounsaturated_fat || null,
                trans_fat: args.trans_fat || null,
                cholesterol: args.cholesterol || null,
                sodium: args.sodium || null,
                potassium: args.potassium || null,
                dietary_fiber: args.fiber || null,
                sugars: args.sugar || null,
                vitamin_a: args.vitamin_a || null,
                vitamin_c: args.vitamin_c || null,
                calcium: args.calcium || null,
                iron: args.iron || null,
                glycemic_index: args.gi || null,
              });
              const v = food.default_variant;
              let msg = `Food "${food.name}" created with ${v?.calories || 0} kcal per ${v?.serving_size || 100}${v?.serving_unit || 'g'}.`;
              if (args.meal_type) {
                const entryDate = args.entry_date || todayInZone(tz);
                await foodEntryService.createFoodEntry(userId, userId, {
                  user_id: userId,
                  food_id: food.id,
                  variant_id: v?.id,
                  entry_date: entryDate,
                  quantity: targetQuantity,
                  unit: targetUnit,
                  meal_type: args.meal_type,
                });
                msg += ` Also logged to ${args.meal_type} for ${entryDate}.`;
              }
              return formatConfirmation(msg);
            }

            case 'search_meal': {
              const meals = await mealService.searchMeals(
                userId,
                args.meal_name
              );
              return formatList(
                meals,
                `Meal Search: "${args.meal_name}"`,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (m: any) => {
                  let text = `**${m.name}**`;
                  if (m.description) text += ` — ${m.description}`;
                  text += `\n  Foods: ${m.foods.length} items`;
                  if (m.foods.length > 0) {
                    text += ` (${m.foods
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      .map((f: any) =>
                        f.item_type === 'meal'
                          ? `[meal] ${f.child_meal_name || f.food_name}`
                          : f.food_name
                      )
                      .join(', ')})`;
                  }
                  text += `\n  ID: ${m.id}`;
                  return text;
                }
              );
            }

            case 'log_meal': {
              if (!args.meal_id && !args.meal_name) {
                return ERRORS.VALIDATION(
                  'Either meal_id or meal_name must be provided'
                );
              }
              let mealId = args.meal_id;
              let mealName = args.meal_name || '';
              if (!mealId && args.meal_name) {
                // Exact-insensitive name match over the server's substring
                // search (MCP's `name ILIKE $1 LIMIT 1`).
                const meals = await mealService.searchMeals(
                  userId,
                  args.meal_name
                );
                const name = args.meal_name.toLowerCase();
                const match = meals.find(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (m: any) => String(m.name).toLowerCase() === name
                );
                if (!match) {
                  return ERRORS.VALIDATION(
                    `Meal "${args.meal_name}" not found.`
                  );
                }
                mealId = match.id;
                mealName = match.name;
              } else if (mealId) {
                try {
                  const meal = await mealService.getMealById(userId, mealId);
                  mealName = meal.name;
                } catch (error) {
                  if (
                    error instanceof Error &&
                    error.message.includes('not found')
                  ) {
                    return ERRORS.VALIDATION(
                      `Meal with ID "${mealId}" not found.`
                    );
                  }
                  throw error;
                }
              }
              await foodEntryService.createFoodEntryMeal(userId, userId, {
                user_id: userId,
                meal_template_id: mealId,
                meal_type: args.meal_type,
                entry_date: args.entry_date,
                name: mealName,
                quantity: args.quantity || 1,
                unit: args.unit || 'serving',
                _clientMealModelVersion: 2,
              });
              return formatConfirmation(
                `Meal "${mealName}" logged for ${args.meal_type} on ${args.entry_date}.`
              );
            }

            case 'list_diary': {
              const date = args.entry_date || todayInZone(tz);
              const prefs = await preferenceService.getUserPreferences(
                userId,
                userId
              );
              const eUnit = (prefs?.energy_unit as string) || 'kcal';
              const foodRows = await foodEntryService.getFoodEntriesByDate(
                userId,
                userId,
                date
              );
              const mealRows =
                await foodEntryMealRepository.getFoodEntryMealsByDate(
                  userId,
                  date
                );

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const foodEntries = foodRows.map((row: any) => {
                const servingSize = Number(row.serving_size) || 1;
                const servingUnit = (
                  row.serving_unit || 'serving'
                ).toLowerCase();
                const unit = (row.unit || 'serving').toLowerCase();
                const quantity = Number(row.quantity);

                // Unit-compatibility multiplier: "serving" or a unit other
                // than the variant's is treated as absolute servings.
                const multiplier =
                  unit === 'serving' || unit !== servingUnit
                    ? quantity
                    : quantity / servingSize;

                const scale = (val: unknown) => {
                  const n = Number(val);
                  return isNaN(n) ? 0 : Math.round(n * multiplier * 10) / 10;
                };

                const scaledCalories = scale(row.calories);
                const displayCalories =
                  eUnit === 'kJ'
                    ? convertEnergy(scaledCalories, 'kcal', 'kJ')
                    : scaledCalories;

                return {
                  id: row.id,
                  food_name: row.food_name,
                  quantity,
                  unit: row.unit || 'g',
                  meal_type: row.meal_type
                    ? String(row.meal_type).toLowerCase()
                    : 'snacks',
                  entry_type: 'food_entry' as const,
                  nutritional_values: isSet(row.calories)
                    ? {
                        calories: Math.round(displayCalories),
                        protein: scale(row.protein),
                        carbs: scale(row.carbs),
                        fat: scale(row.fat),
                      }
                    : undefined,
                };
              });

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const mealEntries = mealRows.map((row: any) => ({
                id: row.id,
                meal_name: row.name,
                quantity: Number(row.quantity),
                meal_type: row.meal_type
                  ? String(row.meal_type).toLowerCase()
                  : 'snacks',
                entry_type: 'food_entry_meal' as const,
              }));

              const allEntries = [...foodEntries, ...mealEntries];
              const dateLabel = args.entry_date || 'Today';
              let text = `# Food Diary: ${dateLabel}\n\n`;

              if (allEntries.length === 0) {
                text += 'No entries found for this date.';
              } else {
                const grouped: Record<string, typeof allEntries> = {};
                for (const entry of allEntries) {
                  const mt = entry.meal_type || 'other';
                  if (!grouped[mt]) grouped[mt] = [];
                  grouped[mt].push(entry);
                }

                let totalEnergy = 0;
                for (const [mealType, entries] of Object.entries(grouped)) {
                  text += `## ${mealType.charAt(0).toUpperCase() + mealType.slice(1)}\n`;
                  for (const entry of entries) {
                    if (entry.entry_type === 'food_entry') {
                      text += `- **${entry.food_name}** — ${entry.quantity} ${entry.unit}`;
                      if (entry.nutritional_values?.calories) {
                        text += ` (${entry.nutritional_values.calories} ${eUnit})`;
                        totalEnergy += entry.nutritional_values.calories;
                      }
                      text += `\n  ID: ${entry.id} | Type: food_entry\n`;
                    } else {
                      text += `- **${entry.meal_name}** (meal template) — ${entry.quantity}x`;
                      text += `\n  ID: ${entry.id} | Type: food_entry_meal\n`;
                    }
                  }
                  text += '\n';
                }

                if (totalEnergy > 0) {
                  text += `---\n**Total Energy:** ${totalEnergy} ${eUnit}`;
                }
              }

              return text;
            }

            case 'delete_entry': {
              try {
                if (args.entry_type === 'food_entry') {
                  await foodEntryService.deleteFoodEntry(userId, args.entry_id);
                } else {
                  await foodEntryService.deleteFoodEntryMeal(
                    userId,
                    args.entry_id
                  );
                }
              } catch (error) {
                if (
                  error instanceof Error &&
                  error.message.includes('not found')
                ) {
                  return ERRORS.NOT_FOUND('Entry', args.entry_id);
                }
                throw error;
              }
              return formatConfirmation('Entry deleted.');
            }

            case 'delete_food': {
              if (!args.food_id && !args.food_name) {
                return ERRORS.VALIDATION(
                  'Either food_id or food_name must be provided'
                );
              }
              let foodId = args.food_id;
              let name = args.food_name;
              if (!foodId) {
                const row = await findFoodByExactName(
                  userId,
                  args.food_name ?? ''
                );
                if (!row) {
                  return ERRORS.VALIDATION(
                    `Food "${args.food_name}" not found.`
                  );
                }
                foodId = row.id;
                name = row.name;
              } else {
                const row = await foodRepository.getFoodById(foodId, userId);
                if (!row) {
                  return ERRORS.NOT_FOUND(
                    'Food',
                    args.food_id || args.food_name || 'unknown'
                  );
                }
                name = row.name;
              }
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let result: any;
              try {
                result = await foodCoreService.deleteFood(userId, foodId, true);
              } catch (error) {
                if (
                  error instanceof Error &&
                  (error.message.includes('not found') ||
                    error.message.includes('Forbidden'))
                ) {
                  return ERRORS.NOT_FOUND(
                    'Food',
                    args.food_id || args.food_name || 'unknown'
                  );
                }
                throw error;
              }
              if (result.status === 'hidden') {
                // Named drift: other users still reference this food, so the
                // server hides it instead of deleting (MCP hit an FK
                // violation here and returned a DB error).
                return formatConfirmation(
                  `Food "${name}" hidden (marked as quick food). Existing references remain.`
                );
              }
              return formatConfirmation(
                `Food "${name}" deleted (including variants and diary entries).`
              );
            }

            case 'update_entry': {
              try {
                if (args.entry_type === 'food_entry') {
                  await foodEntryService.updateFoodEntry(
                    userId,
                    userId,
                    args.entry_id,
                    { quantity: args.quantity, unit: args.unit }
                  );
                } else {
                  // Round-trip the template link and component foods so the
                  // server's edit path rescales components instead of
                  // detaching them.
                  const existing =
                    await foodEntryService.getFoodEntryMealWithComponents(
                      userId,
                      args.entry_id
                    );
                  if (!existing) {
                    return ERRORS.NOT_FOUND('Entry', args.entry_id);
                  }
                  await foodEntryService.updateFoodEntryMeal(
                    userId,
                    userId,
                    args.entry_id,
                    {
                      meal_template_id: existing.meal_template_id,
                      entry_date: dayString(existing.entry_date),
                      quantity: args.quantity,
                      unit: args.unit,
                      foods: existing.foods,
                    }
                  );
                }
              } catch (error) {
                if (
                  error instanceof Error &&
                  error.message.includes('not found')
                ) {
                  return ERRORS.NOT_FOUND('Entry', args.entry_id);
                }
                throw error;
              }
              return formatConfirmation(
                `Entry updated to ${args.quantity} ${args.unit}.`
              );
            }

            case 'update_food_variant': {
              if (!args.food_id && !args.variant_id) {
                // MCP quirk: this guard threw a plain error whose message
                // does not contain 'not found', so it surfaced as a DB
                // error — ported as-is.
                return ERRORS.DB_ERROR();
              }
              let variantId = args.variant_id;
              if (!variantId) {
                const food = await foodRepository.getFoodById(
                  args.food_id,
                  userId
                );
                if (
                  !food ||
                  food.user_id !== userId ||
                  !food.default_variant?.id
                ) {
                  return ERRORS.VALIDATION(
                    `Default variant for food_id "${args.food_id}" not found or not editable.`
                  );
                }
                variantId = food.default_variant.id;
              }
              const variant = await foodRepository.getFoodVariantById(
                variantId,
                userId
              );
              const parentFood = variant
                ? await foodRepository.getFoodById(variant.food_id, userId)
                : null;
              if (!variant || !parentFood || parentFood.user_id !== userId) {
                return ERRORS.VALIDATION(
                  `Food variant "${variantId}" not found or not editable.`
                );
              }
              if (args.food_id && variant.food_id !== args.food_id) {
                // MCP quirk: "does not belong" threw and surfaced as a DB
                // error — ported as-is.
                return ERRORS.DB_ERROR();
              }

              const updates: Record<string, unknown> = {};
              const fieldMap: Record<string, string> = {
                serving_size: 'serving_size',
                serving_unit: 'serving_unit',
                calories: 'calories',
                protein: 'protein',
                carbs: 'carbs',
                fat: 'fat',
                saturated_fat: 'saturated_fat',
                polyunsaturated_fat: 'polyunsaturated_fat',
                monounsaturated_fat: 'monounsaturated_fat',
                trans_fat: 'trans_fat',
                cholesterol: 'cholesterol',
                sodium: 'sodium',
                potassium: 'potassium',
                fiber: 'dietary_fiber',
                sugar: 'sugars',
                vitamin_a: 'vitamin_a',
                vitamin_c: 'vitamin_c',
                calcium: 'calcium',
                iron: 'iron',
                gi: 'glycemic_index',
              };
              for (const [inputField, dbField] of Object.entries(fieldMap)) {
                const value = (args as Record<string, unknown>)[inputField];
                if (value !== undefined) {
                  updates[dbField] = value;
                }
              }
              if (Object.keys(updates).length === 0) {
                // MCP quirk: "at least one field" threw and surfaced as a
                // DB error — ported as-is.
                return ERRORS.DB_ERROR();
              }

              const updated = await foodRepository.updateFoodVariant(
                variantId,
                updates,
                userId
              );
              if (args.update_existing_entries) {
                await foodCoreService.updateFoodEntriesSnapshot(
                  userId,
                  variant.food_id,
                  variantId
                );
              }
              return formatConfirmation(
                `Food variant updated for "${parentFood.name}" (${updated.calories ?? 0} kcal per ${updated.serving_size ?? '?'}${updated.serving_unit ?? ''}).`
              );
            }

            case 'copy_from_yesterday': {
              // MCP's defaults: target falls back to today, source to
              // yesterday-of-today (not yesterday-of-target).
              const targetDate = args.target_date || todayInZone(tz);
              const sourceDate =
                args.source_date || addDays(todayInZone(tz), -1);
              const copied = args.meal_type
                ? await foodEntryService.copyFoodEntries(
                    userId,
                    userId,
                    sourceDate,
                    args.meal_type,
                    targetDate,
                    args.meal_type
                  )
                : await foodEntryService.copyAllFoodEntries(
                    userId,
                    userId,
                    sourceDate,
                    targetDate
                  );
              if (copied.length === 0) {
                return formatConfirmation(
                  'No entries found to copy from the source date.'
                );
              }
              return formatConfirmation(
                `Copied ${copied.length} entries to ${targetDate}.`
              );
            }

            case 'save_as_meal_template': {
              const meal = await mealService.createMealFromDiaryEntries(
                userId,
                args.entry_date,
                args.meal_type,
                args.meal_name,
                args.description ?? null
              );
              // createMealFromDiaryEntries returns the meal without its
              // foods; re-fetch for the item count.
              const saved = await mealService.getMealById(userId, meal.id);
              return formatConfirmation(
                `Meal template "${meal.name}" saved with ${saved.foods.length} food items.`
              );
            }

            case 'log_water': {
              await measurementService.logWaterIntakeAmount(
                userId,
                userId,
                args.entry_date,
                args.amount_ml
              );
              return formatConfirmation(
                `Logged ${args.amount_ml}ml water for ${args.entry_date}.`
              );
            }

            case 'get_nutritional_summary': {
              const summary = await getNutritionalSummaryRows(
                userId,
                args.start_date,
                args.end_date
              );
              const eUnit =
                summary.length > 0 ? summary[0].energy_unit : 'kcal';
              return formatList(
                summary,
                `Nutritional Summary (${args.start_date} to ${args.end_date})`,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (s: any) => {
                  let text = `**${s.entry_date}**:\n`;
                  text += `  Macros: ${s.calories} ${eUnit} | P: ${s.protein}g | C: ${s.carbs}g | F: ${s.fat}g\n`;
                  text += `  Fiber: ${s.fiber}g | Sugar: ${s.sugar}g | Sodium: ${s.sodium}mg\n`;
                  if (s.saturated_fat || s.cholesterol || s.potassium) {
                    text += `  Other: SatFat: ${s.saturated_fat}g | Chol: ${s.cholesterol}mg | Potas: ${s.potassium}mg`;
                  }
                  return text;
                }
              );
            }

            case 'get_water_history': {
              const history = await getWaterHistoryRows(
                userId,
                args.start_date,
                args.end_date
              );
              return formatList(
                history,
                'Water Intake History',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (h: any) => `**${h.entry_date}**: ${h.amount} ${h.unit}`
              );
            }

            default:
              return ERRORS.INVALID_ACTION(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                String((args as any).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          log('error', '[Food Tool] Error:', error);
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.VALIDATION(error.message);
          }
          return ERRORS.DB_ERROR();
        }
      },
    }),

    sparky_list_foods: tool({
      description:
        'Returns a paginated food catalog for the authenticated user, including variants.',
      inputSchema: listFoodsSchema,
      execute: async (rawArgs) => {
        const parsed = listFoodsSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const { limit, offset } = normalizePagination(
            parsed.data.limit,
            parsed.data.offset
          );
          const search = parsed.data.search?.trim() || undefined;
          const [rows, totalCount] = await Promise.all([
            foodRepository.getFoodsWithPagination(
              search,
              null,
              userId,
              limit,
              offset,
              null
            ),
            foodRepository.countFoods(search, null, userId),
          ]);
          const data = buildPaginatedResult(
            rows.map(projectCatalogFood),
            totalCount,
            offset
          );
          return formatJsonResult(data);
        } catch (error) {
          log('error', '[Food Tool] sparky_list_foods error:', error);
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.NOT_FOUND('Food', 'unknown');
          }
          return ERRORS.DB_ERROR();
        }
      },
    }),

    sparky_get_food_details: tool({
      description:
        'Returns full details for one food by food_id, including available variants.',
      inputSchema: getFoodDetailsSchema,
      execute: async (rawArgs) => {
        const parsed = getFoodDetailsSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const food = await foodCoreService.getFoodById(
            userId,
            parsed.data.food_id
          );
          const variants = await foodRepository.getFoodVariantsByFoodId(
            parsed.data.food_id,
            userId
          );
          const { default_variant: _defaultVariant, ...rest } = food;
          const data = {
            ...compactRecord(rest, CATALOG_FOOD_DROP),
            variants: variants.map((v: Record<string, unknown>) =>
              compactRecord(v, VARIANT_DROP)
            ),
          };
          return formatJsonResult(data);
        } catch (error) {
          log('error', '[Food Tool] sparky_get_food_details error:', error);
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.NOT_FOUND('Food', parsed.data.food_id);
          }
          return ERRORS.DB_ERROR();
        }
      },
    }),

    sparky_search_foods: tool({
      description: 'Searches foods by name for the authenticated user.',
      inputSchema: searchFoodsSchema,
      execute: async (rawArgs) => {
        const parsed = searchFoodsSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const { limit, offset } = normalizePagination(
            parsed.data.limit,
            parsed.data.offset
          );
          const [rows, totalCount] = await Promise.all([
            foodRepository.getFoodsWithPagination(
              parsed.data.query,
              null,
              userId,
              limit,
              offset,
              null
            ),
            foodRepository.countFoods(parsed.data.query, null, userId),
          ]);
          const data = buildPaginatedResult(
            rows.map(projectCatalogFood),
            totalCount,
            offset
          );
          return formatJsonResult(data);
        } catch (error) {
          log('error', '[Food Tool] sparky_search_foods error:', error);
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.NOT_FOUND('Food', parsed.data.query);
          }
          return ERRORS.DB_ERROR();
        }
      },
    }),

    sparky_get_food_diary: tool({
      description:
        'Returns entry-level food diary data for a specific date or date range.',
      inputSchema: foodDateRangeSchema,
      execute: async (rawArgs) => {
        const parsed = foodDateRangeSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const { startDate, endDate } = foodDateRange(parsed.data, tz);
          const foodEntries = await foodEntryService.getFoodEntriesByDateRange(
            userId,
            userId,
            startDate,
            endDate
          );
          const mealEntries =
            await foodEntryMealRepository.getFoodEntryMealsByDateRange(
              userId,
              startDate,
              endDate
            );
          const data = {
            start_date: startDate,
            end_date: endDate,
            food_entries: foodEntries.map((e: Record<string, unknown>) =>
              compactRecord(e, DIARY_ENTRY_DROP)
            ),
            meal_entries: mealEntries.map((m: Record<string, unknown>) =>
              compactRecord(m, DIARY_MEAL_DROP)
            ),
          };
          return formatJsonResult(data);
        } catch (error) {
          log('error', '[Food Tool] sparky_get_food_diary error:', error);
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.NOT_FOUND(
              'Food diary',
              parsed.data.date || parsed.data.start_date || 'unknown'
            );
          }
          return ERRORS.DB_ERROR();
        }
      },
    }),

    sparky_get_nutrition_summary: tool({
      description:
        'Returns nutrition summary rows for a specific date or date range.',
      inputSchema: foodDateRangeSchema,
      execute: async (rawArgs) => {
        const parsed = foodDateRangeSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const { startDate, endDate } = foodDateRange(parsed.data, tz);
          const data = await getNutritionalSummaryRows(
            userId,
            startDate,
            endDate
          );
          return formatJsonResult(data);
        } catch (error) {
          log(
            'error',
            '[Food Tool] sparky_get_nutrition_summary error:',
            error
          );
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.NOT_FOUND(
              'Nutrition summary',
              parsed.data.date || parsed.data.start_date || 'unknown'
            );
          }
          return ERRORS.DB_ERROR();
        }
      },
    }),

    sparky_get_recent_food_entries: tool({
      description:
        'Returns recent entry-level food diary rows for the authenticated user.',
      inputSchema: recentFoodEntriesSchema,
      execute: async (rawArgs) => {
        const parsed = recentFoodEntriesSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const limit = Math.min(Math.max(parsed.data.limit ?? 50, 1), 200);
          const rows = await foodRepository.getRecentFoodEntries(userId, limit);
          const data = rows.map((r: Record<string, unknown>) =>
            compactRecord(r, FULL_ENTRY_DROP)
          );
          return formatJsonResult(data);
        } catch (error) {
          log(
            'error',
            '[Food Tool] sparky_get_recent_food_entries error:',
            error
          );
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.NOT_FOUND('Food entries', 'recent');
          }
          return ERRORS.DB_ERROR();
        }
      },
    }),

    sparky_get_food_usage: tool({
      description: 'Shows where a specific food_id was used in the diary.',
      inputSchema: foodUsageSchema,
      execute: async (rawArgs) => {
        const parsed = foodUsageSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const { food_id, ...query } = parsed.data;
          const { startDate, endDate } = foodDateRange(query, tz);
          const { limit, offset } = normalizePagination(
            query.limit,
            query.offset
          );
          const { rows, totalCount } = await foodRepository.getFoodUsage(
            userId,
            food_id,
            startDate,
            endDate,
            limit,
            offset
          );
          const data = buildPaginatedResult(
            rows.map((r: Record<string, unknown>) =>
              compactRecord(r, FULL_ENTRY_DROP)
            ),
            totalCount,
            offset
          );
          return formatJsonResult(data);
        } catch (error) {
          log('error', '[Food Tool] sparky_get_food_usage error:', error);
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.NOT_FOUND('Food', parsed.data.food_id);
          }
          return ERRORS.DB_ERROR();
        }
      },
    }),
  };
}
