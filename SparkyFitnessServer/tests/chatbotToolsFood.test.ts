import { vi, beforeEach, describe, expect, it } from 'vitest';
import { addDays, todayInZone } from '@workspace/shared';
import { buildFoodTools } from '../ai/tools/foodTools.js';
import foodCoreService from '../services/foodCoreService.js';
import foodEntryService from '../services/foodEntryService.js';
import mealService from '../services/mealService.js';
import preferenceService from '../services/preferenceService.js';
import { searchProviderFoods } from '../services/externalFoodSearchService.js';
import foodRepository from '../models/foodRepository.js';
import foodEntryMealRepository from '../models/foodEntryMealRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import reportRepository from '../models/reportRepository.js';
import externalProviderRepository from '../models/externalProviderRepository.js';

vi.mock('../services/foodCoreService', () => ({
  default: {
    createFood: vi.fn(),
    getFoodById: vi.fn(),
    deleteFood: vi.fn(),
    updateFoodEntriesSnapshot: vi.fn(),
  },
}));
vi.mock('../services/foodEntryService', () => ({
  default: {
    createFoodEntry: vi.fn(),
    getFoodEntriesByDate: vi.fn(),
    getFoodEntriesByDateRange: vi.fn(),
    createFoodEntryMeal: vi.fn(),
    deleteFoodEntry: vi.fn(),
    deleteFoodEntryMeal: vi.fn(),
    updateFoodEntry: vi.fn(),
    updateFoodEntryMeal: vi.fn(),
    getFoodEntryMealWithComponents: vi.fn(),
    copyFoodEntries: vi.fn(),
    copyAllFoodEntries: vi.fn(),
  },
}));
vi.mock('../services/mealService', () => ({
  default: {
    searchMeals: vi.fn(),
    getMealById: vi.fn(),
    createMealFromDiaryEntries: vi.fn(),
  },
}));
vi.mock('../services/preferenceService', () => ({
  default: {
    getUserPreferences: vi.fn(),
  },
}));
vi.mock('../services/externalFoodSearchService', () => ({
  searchProviderFoods: vi.fn(),
}));
vi.mock('../models/foodRepository', () => ({
  default: {
    getFoodsWithPagination: vi.fn(),
    countFoods: vi.fn(),
    getFoodById: vi.fn(),
    getFoodVariantById: vi.fn(),
    updateFoodVariant: vi.fn(),
    getFoodVariantsByFoodId: vi.fn(),
    getRecentFoodEntries: vi.fn(),
    getFoodUsage: vi.fn(),
  },
}));
vi.mock('../models/foodEntryMealRepository', () => ({
  default: {
    getFoodEntryMealsByDate: vi.fn(),
    getFoodEntryMealsByDateRange: vi.fn(),
  },
}));
vi.mock('../models/measurementRepository', () => ({
  default: {
    insertWaterIntakeLog: vi.fn(),
    getWaterIntakeByDate: vi.fn(),
    upsertWaterData: vi.fn(),
    getWaterTotalsByDateRange: vi.fn(),
  },
}));
vi.mock('../models/reportRepository', () => ({
  default: {
    getDailyNutritionTotalsRange: vi.fn(),
  },
}));
vi.mock('../models/externalProviderRepository', () => ({
  default: {
    getActiveProvidersByTypes: vi.fn(),
  },
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const opts = { toolCallId: 'tc-1', messages: [] };
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred. Please try again.\n\nSuggestion: If the issue persists, contact support.';

const FOOD_ID = '11111111-1111-4111-8111-111111111111';
const VARIANT_ID = '22222222-2222-4222-8222-222222222222';
const ENTRY_ID = '33333333-3333-4333-8333-333333333333';
const MEAL_ID = '44444444-4444-4444-8444-444444444444';
const FOOD_ID_2 = '55555555-5555-4555-8555-555555555555';

const FOOD_PROVIDER_TYPES = [
  'fatsecret',
  'mealie',
  'tandoor',
  'norish',
  'usda',
  'openfoodfacts',
];

const eggsRow = {
  id: FOOD_ID,
  name: 'Eggs',
  brand: 'Farm Fresh',
  user_id: 'user-1',
  default_variant: {
    id: VARIANT_ID,
    serving_size: 100,
    serving_unit: 'g',
    calories: 155,
    protein: 13,
    carbs: 1.1,
    fat: 11,
    saturated_fat: 3.3,
    polyunsaturated_fat: null,
    monounsaturated_fat: null,
    trans_fat: null,
    cholesterol: 373,
    sodium: 124,
    potassium: null,
    dietary_fiber: 0,
    sugars: 1.1,
    vitamin_a: null,
    vitamin_c: null,
    calcium: null,
    iron: null,
    glycemic_index: null,
  },
};

let tools: ReturnType<typeof buildFoodTools>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(preferenceService.getUserPreferences).mockResolvedValue({
    energy_unit: 'kcal',
    water_display_unit: 'ml',
  });
  tools = buildFoodTools('user-1', 'UTC');
});

describe('sparky_manage_food validation', () => {
  it('renders zod issues for a missing per-action field', async () => {
    const result = await tools.sparky_manage_food.execute!(
      { action: 'search_food', search_type: 'broad' },
      opts
    );
    expect(result).toBe(
      'Error [VALIDATION]: food_name: Invalid input: expected string, received undefined'
    );
  });
});

describe('search_food', () => {
  it('renders broad matches with the default-variant macro line', async () => {
    vi.mocked(foodRepository.getFoodsWithPagination).mockResolvedValue([
      eggsRow,
    ]);
    vi.mocked(foodRepository.countFoods).mockResolvedValue(1);

    const result = await tools.sparky_manage_food.execute!(
      { action: 'search_food', food_name: 'egg', search_type: 'broad' },
      opts
    );

    expect(result).toBe(
      `# Food Search: "egg" (broad)\n\n**Eggs** (Farm Fresh)\n  100g: 155 kcal | P: 13g | C: 1.1g | F: 11g\n  ID: ${FOOD_ID} | Variant: ${VARIANT_ID}\n\n---\nShowing 1 of 1 results.`
    );
    expect(foodRepository.getFoodsWithPagination).toHaveBeenCalledWith(
      'egg',
      null,
      'user-1',
      20,
      0,
      null
    );
  });

  it('filters exact matches by case-insensitive name equality in the tool layer', async () => {
    vi.mocked(foodRepository.getFoodsWithPagination).mockResolvedValue([
      { ...eggsRow, id: FOOD_ID_2, name: 'Eggs Benedict Mix' },
      { ...eggsRow, name: 'eggs' },
    ]);

    const result = await tools.sparky_manage_food.execute!(
      { action: 'search_food', food_name: 'Eggs', search_type: 'exact' },
      opts
    );

    expect(result).toBe(
      `# Food Search: "Eggs" (exact)\n\n**eggs** (Farm Fresh)\n  100g: 155 kcal | P: 13g | C: 1.1g | F: 11g\n  ID: ${FOOD_ID} | Variant: ${VARIANT_ID}\n\n---\nShowing 1 of 1 results.`
    );
    expect(foodRepository.getFoodsWithPagination).toHaveBeenCalledWith(
      'Eggs',
      null,
      'user-1',
      500,
      0,
      null
    );
    expect(foodRepository.countFoods).not.toHaveBeenCalled();
  });

  it('renders no results for an empty search', async () => {
    vi.mocked(foodRepository.getFoodsWithPagination).mockResolvedValue([]);
    vi.mocked(foodRepository.countFoods).mockResolvedValue(0);

    const result = await tools.sparky_manage_food.execute!(
      { action: 'search_food', food_name: 'nope', search_type: 'broad' },
      opts
    );

    expect(result).toBe(
      '# Food Search: "nope" (broad)\n\nNo results found.\n\n---\nShowing 0 of 0 results.'
    );
  });
});

describe('lookup_food_nutrition', () => {
  it('returns the internal match without touching external providers', async () => {
    vi.mocked(foodRepository.getFoodsWithPagination).mockResolvedValue([
      eggsRow,
      { ...eggsRow, id: FOOD_ID_2, name: 'eggs', brand: 'Other Farm' },
    ]);

    const result = await tools.sparky_manage_food.execute!(
      { action: 'lookup_food_nutrition', food_name: 'Eggs' },
      opts
    );

    expect(result).toBe(
      `### Found match in **internal**:\n**Eggs** (Farm Fresh)\n  Serving Size: 100 g\n  Energy: 155 kcal\n  Macros: Protein: 13g | Carbs: 1.1g | Fat: 11g\n  Details: Fiber: 0g | Sugar: 1.1g | Sodium: 124mg | SatFat: 3.3g\n  ID: ${FOOD_ID}\n\n**Other Alternatives found:**\n- **eggs** (Other Farm) (100g: 155 kcal)`
    );
    expect(searchProviderFoods).not.toHaveBeenCalled();
  });

  it('cascades through active providers in order and appends OpenFoodFacts', async () => {
    vi.mocked(foodRepository.getFoodsWithPagination).mockResolvedValue([]);
    vi.mocked(foodRepository.countFoods).mockResolvedValue(0);
    vi.mocked(
      externalProviderRepository.getActiveProvidersByTypes
    ).mockResolvedValue([
      { id: 'prov-1', provider_type: 'usda', provider_name: 'USDA' },
    ]);
    vi.mocked(searchProviderFoods).mockResolvedValue({
      foods: [],
      pagination: { page: 1, pageSize: 20, totalCount: 0, hasMore: false },
    });

    const result = await tools.sparky_manage_food.execute!(
      { action: 'lookup_food_nutrition', food_name: 'dragonfruit smoothie' },
      opts
    );

    expect(result).toBe(
      'No matches found in internal DB or configured external databases/OpenFoodFacts for "dragonfruit smoothie". You may estimate the nutrition using AI and save it using create_food.'
    );
    expect(
      externalProviderRepository.getActiveProvidersByTypes
    ).toHaveBeenCalledWith('user-1', FOOD_PROVIDER_TYPES);
    expect(searchProviderFoods).toHaveBeenNthCalledWith(
      1,
      'user-1',
      'usda',
      'dragonfruit smoothie',
      { providerId: 'prov-1' }
    );
    expect(searchProviderFoods).toHaveBeenNthCalledWith(
      2,
      'user-1',
      'openfoodfacts',
      'dragonfruit smoothie',
      { providerId: undefined }
    );
  });

  it('renders a provider match with external id and alternatives', async () => {
    vi.mocked(foodRepository.getFoodsWithPagination).mockResolvedValue([]);
    vi.mocked(foodRepository.countFoods).mockResolvedValue(0);
    vi.mocked(
      externalProviderRepository.getActiveProvidersByTypes
    ).mockResolvedValue([
      { id: 'prov-1', provider_type: 'usda', provider_name: 'USDA' },
    ]);
    vi.mocked(searchProviderFoods).mockResolvedValue({
      foods: [
        {
          name: 'Apple',
          brand: 'USDA',
          provider_external_id: '171688',
          default_variant: {
            serving_size: 100,
            serving_unit: 'g',
            calories: 52,
            protein: 0.3,
            carbs: 14,
            fat: 0.2,
            saturated_fat: null,
            dietary_fiber: 2.4,
            sugars: 10,
            sodium: 1,
          },
        },
        {
          name: 'Apple juice',
          default_variant: {
            serving_size: 240,
            serving_unit: 'ml',
            calories: 110,
          },
        },
      ],
      pagination: { page: 1, pageSize: 20, totalCount: 2, hasMore: false },
    });

    const result = await tools.sparky_manage_food.execute!(
      { action: 'lookup_food_nutrition', food_name: 'apple' },
      opts
    );

    expect(result).toBe(
      '### Found match in **usda**:\n**Apple** (USDA)\n  Serving Size: 100 g\n  Energy: 52 kcal\n  Macros: Protein: 0.3g | Carbs: 14g | Fat: 0.2g\n  Details: Fiber: 2.4g | Sugar: 10g | Sodium: 1mg | SatFat: 0g\n  External ID: 171688\n\n**Other Alternatives found:**\n- **Apple juice** (240ml: 110 kcal)\n\nNote: this external result is not saved in the food database yet. To log it, call create_food with these nutrition values (include meal_type and entry_date to log it in the same call). Do NOT pass the External ID as food_id.'
    );
  });

  it('continues past a failing provider to the next one', async () => {
    vi.mocked(foodRepository.getFoodsWithPagination).mockResolvedValue([]);
    vi.mocked(foodRepository.countFoods).mockResolvedValue(0);
    vi.mocked(
      externalProviderRepository.getActiveProvidersByTypes
    ).mockResolvedValue([
      { id: 'prov-1', provider_type: 'fatsecret', provider_name: 'FatSecret' },
    ]);
    vi.mocked(searchProviderFoods)
      .mockRejectedValueOnce(new Error('provider exploded'))
      .mockResolvedValueOnce({
        foods: [
          {
            name: 'Apple',
            default_variant: {
              serving_size: 100,
              serving_unit: 'g',
              calories: 52,
              protein: 0.3,
              carbs: 14,
              fat: 0.2,
            },
          },
        ],
        pagination: { page: 1, pageSize: 20, totalCount: 1, hasMore: false },
      });

    const result = await tools.sparky_manage_food.execute!(
      { action: 'lookup_food_nutrition', food_name: 'apple' },
      opts
    );

    expect(result).toBe(
      '### Found match in **openfoodfacts**:\n**Apple**\n  Serving Size: 100 g\n  Energy: 52 kcal\n  Macros: Protein: 0.3g | Carbs: 14g | Fat: 0.2g\n\nNote: this external result is not saved in the food database yet. To log it, call create_food with these nutrition values (include meal_type and entry_date to log it in the same call). Do NOT pass the External ID as food_id.'
    );
  });

  it('falls through to ai_estimate when an explicitly requested provider is unconfigured', async () => {
    vi.mocked(
      externalProviderRepository.getActiveProvidersByTypes
    ).mockResolvedValue([]);
    vi.mocked(searchProviderFoods).mockRejectedValue(
      new Error('Missing providerId query parameter')
    );

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'lookup_food_nutrition',
        food_name: 'apple',
        provider_type: 'usda',
      },
      opts
    );

    expect(result).toBe(
      'No matches found in internal DB or configured external databases/OpenFoodFacts for "apple". You may estimate the nutrition using AI and save it using create_food.'
    );
    // Explicit provider bypasses the internal search entirely.
    expect(foodRepository.getFoodsWithPagination).not.toHaveBeenCalled();
    expect(searchProviderFoods).toHaveBeenCalledTimes(1);
    expect(searchProviderFoods).toHaveBeenCalledWith(
      'user-1',
      'usda',
      'apple',
      { providerId: undefined }
    );
  });

  it('returns a DB error for an explicit internal miss (MCP quirk)', async () => {
    vi.mocked(foodRepository.getFoodsWithPagination).mockResolvedValue([]);
    vi.mocked(foodRepository.countFoods).mockResolvedValue(0);

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'lookup_food_nutrition',
        food_name: 'nope',
        provider_type: 'internal',
      },
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
    expect(searchProviderFoods).not.toHaveBeenCalled();
  });
});

describe('log_food', () => {
  it('resolves the food by exact name and logs with the default variant', async () => {
    vi.mocked(foodRepository.getFoodsWithPagination).mockResolvedValue([
      { ...eggsRow, name: 'eggs' },
    ]);
    vi.mocked(foodEntryService.createFoodEntry).mockResolvedValue({
      id: ENTRY_ID,
      food_name: 'eggs',
    });

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'log_food',
        food_name: 'Eggs',
        quantity: 2,
        unit: 'serving',
        meal_type: 'breakfast',
        entry_date: '2026-06-10',
      },
      opts
    );

    expect(result).toBe(
      '✅ Logged "eggs" (2 serving) for breakfast on 2026-06-10.'
    );
    expect(foodEntryService.createFoodEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      {
        user_id: 'user-1',
        food_id: FOOD_ID,
        variant_id: VARIANT_ID,
        entry_date: '2026-06-10',
        quantity: 2,
        unit: 'serving',
        meal_type: 'breakfast',
      }
    );
  });

  it('asks for create_food when no food matches the name', async () => {
    vi.mocked(foodRepository.getFoodsWithPagination).mockResolvedValue([]);

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'log_food',
        food_name: 'Unicorn Steak',
        quantity: 1,
        unit: 'serving',
        meal_type: 'dinner',
        entry_date: '2026-06-10',
      },
      opts
    );

    expect(result).toBe(
      'Error [VALIDATION]: Food "Unicorn Steak" not found. Create it first using the create_food action with the nutrition values from lookup_food_nutrition (include meal_type and entry_date to log it in the same call).'
    );
    expect(foodEntryService.createFoodEntry).not.toHaveBeenCalled();
  });

  // Regression: models paste a lookup result's provider "External ID" (e.g. a
  // USDA FDC id like '2058078') into food_id. That must fall back to name
  // resolution, not blow up on UUID validation.
  it('ignores a non-UUID food_id (provider External ID) and resolves by name', async () => {
    vi.mocked(foodRepository.getFoodsWithPagination).mockResolvedValue([
      eggsRow,
    ]);
    vi.mocked(foodEntryService.createFoodEntry).mockResolvedValue({
      id: ENTRY_ID,
      food_name: 'Eggs',
    });

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'log_food',
        food_name: 'Eggs',
        food_id: '2058078',
        quantity: 2,
        unit: 'serving',
        meal_type: 'breakfast',
        entry_date: '2026-06-10',
      },
      opts
    );

    expect(result).toBe(
      '✅ Logged "Eggs" (2 serving) for breakfast on 2026-06-10.'
    );
    expect(foodEntryService.createFoodEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      expect.objectContaining({ food_id: FOOD_ID })
    );
  });

  it('returns a chat-visible correction for a non-UUID food_id without a food_name', async () => {
    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'delete_food',
        food_id: '2058078',
      },
      opts
    );

    expect(result).toBe(
      "Error [VALIDATION]: food_id '2058078' is not an internal food UUID — External IDs from lookup_food_nutrition results cannot be logged directly. Retry with the food_name instead, or create the food first with create_food using the looked-up nutrition values."
    );
    expect(foodEntryService.createFoodEntry).not.toHaveBeenCalled();
  });

  // Regression: after a lookup returns an internal ID, models log with just
  // (food_id, quantity, meal_type). unit must default to the food's serving
  // unit and entry_date to today — requiring them dead-ended small models.
  it('logs with only food_id/quantity/meal_type, defaulting unit and date', async () => {
    vi.mocked(foodRepository.getFoodById).mockResolvedValue(eggsRow);
    vi.mocked(foodEntryService.createFoodEntry).mockResolvedValue({
      id: ENTRY_ID,
      food_name: 'Eggs',
    });

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'log_food',
        food_id: FOOD_ID,
        quantity: 1,
        meal_type: 'breakfast',
      },
      opts
    );

    const today = todayInZone('UTC');
    expect(result).toBe(
      `✅ Logged "Eggs" (1 ${eggsRow.default_variant.serving_unit}) for breakfast on ${today}.`
    );
    expect(foodEntryService.createFoodEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      expect.objectContaining({
        food_id: FOOD_ID,
        variant_id: VARIANT_ID,
        unit: eggsRow.default_variant.serving_unit,
        entry_date: today,
      })
    );
  });

  // A no-action call shaped like a log (food_id + quantity + meal_type) must
  // infer log_food — it used to fall through to the bare-food_id branch and
  // infer delete_food.
  it('infers log_food (not delete_food) for food_id + quantity + meal_type without action', async () => {
    vi.mocked(foodRepository.getFoodById).mockResolvedValue(eggsRow);
    vi.mocked(foodEntryService.createFoodEntry).mockResolvedValue({
      id: ENTRY_ID,
      food_name: 'Eggs',
    });

    const result = await tools.sparky_manage_food.execute!(
      { food_id: FOOD_ID, quantity: 2, meal_type: 'lunch' },
      opts
    );

    expect(result).toContain('✅ Logged "Eggs"');
    expect(foodEntryService.createFoodEntry).toHaveBeenCalled();
  });

  it('uses an explicit food_id and resolves its default variant', async () => {
    vi.mocked(foodRepository.getFoodById).mockResolvedValue(eggsRow);
    vi.mocked(foodEntryService.createFoodEntry).mockResolvedValue({
      id: ENTRY_ID,
      food_name: 'Eggs',
    });

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'log_food',
        food_name: 'Eggs',
        food_id: FOOD_ID,
        quantity: 100,
        unit: 'g',
        meal_type: 'lunch',
        entry_date: '2026-06-10',
      },
      opts
    );

    expect(result).toBe('✅ Logged "Eggs" (100 g) for lunch on 2026-06-10.');
    expect(foodRepository.getFoodsWithPagination).not.toHaveBeenCalled();
    expect(foodRepository.getFoodById).toHaveBeenCalledWith(FOOD_ID, 'user-1');
  });

  it('maps a snapshotting failure to a validation error with the service message', async () => {
    vi.mocked(foodRepository.getFoodById).mockResolvedValue(eggsRow);
    vi.mocked(foodEntryService.createFoodEntry).mockRejectedValue(
      new Error('Food or variant not found for snapshotting.')
    );

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'log_food',
        food_name: 'Eggs',
        food_id: FOOD_ID,
        quantity: 1,
        unit: 'serving',
        meal_type: 'lunch',
        entry_date: '2026-06-10',
      },
      opts
    );

    expect(result).toBe(
      'Error [VALIDATION]: Food or variant not found for snapshotting.'
    );
  });
});

describe('create_food', () => {
  it('applies count-unit defaults and the 0-becomes-null storage quirk', async () => {
    vi.mocked(foodCoreService.createFood).mockResolvedValue({
      id: FOOD_ID,
      name: 'Protein Bar',
      brand: 'BrandX',
      default_variant: {
        id: VARIANT_ID,
        serving_size: 1,
        serving_unit: 'serving',
        calories: 220,
      },
    });

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'create_food',
        food_name: 'Protein Bar',
        brand: 'BrandX',
        calories: 220,
        protein: 20,
        carbs: 25,
        fat: 8,
        saturated_fat: 3,
        sodium: 180,
        fiber: 2,
        sugar: 0,
        gi: 'Low',
      },
      opts
    );

    expect(result).toBe(
      '✅ Food "Protein Bar" created with 220 kcal per 1serving.'
    );
    expect(foodCoreService.createFood).toHaveBeenCalledWith('user-1', {
      user_id: 'user-1',
      name: 'Protein Bar',
      brand: 'BrandX',
      serving_size: 1,
      serving_unit: 'serving',
      calories: 220,
      protein: 20,
      carbs: 25,
      fat: 8,
      saturated_fat: 3,
      polyunsaturated_fat: null,
      monounsaturated_fat: null,
      trans_fat: null,
      cholesterol: null,
      sodium: 180,
      potassium: null,
      dietary_fiber: 2,
      sugars: null,
      vitamin_a: null,
      vitamin_c: null,
      calcium: null,
      iron: null,
      glycemic_index: 'Low',
    });
    expect(foodEntryService.createFoodEntry).not.toHaveBeenCalled();
  });

  it('defaults non-count units to 100 and auto-logs when meal_type is given', async () => {
    vi.mocked(foodCoreService.createFood).mockResolvedValue({
      id: FOOD_ID,
      name: 'Rice',
      brand: null,
      default_variant: {
        id: VARIANT_ID,
        serving_size: 100,
        serving_unit: 'g',
        calories: 130,
      },
    });
    vi.mocked(foodEntryService.createFoodEntry).mockResolvedValue({
      id: ENTRY_ID,
    });

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'create_food',
        food_name: 'Rice',
        calories: 130,
        protein: 2.7,
        carbs: 28,
        fat: 0.3,
        unit: 'g',
        meal_type: 'lunch',
        entry_date: '2026-06-10',
      },
      opts
    );

    expect(result).toBe(
      '✅ Food "Rice" created with 130 kcal per 100g. Also logged to lunch for 2026-06-10.'
    );
    expect(foodCoreService.createFood).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ serving_size: 100, serving_unit: 'g' })
    );
    expect(foodEntryService.createFoodEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      {
        user_id: 'user-1',
        food_id: FOOD_ID,
        variant_id: VARIANT_ID,
        entry_date: '2026-06-10',
        quantity: 100,
        unit: 'g',
        meal_type: 'lunch',
      }
    );
  });
});

describe('search_meal', () => {
  it('renders meal templates with their food lists', async () => {
    vi.mocked(mealService.searchMeals).mockResolvedValue([
      {
        id: MEAL_ID,
        name: 'Overnight Oats',
        description: 'Easy breakfast',
        foods: [{ food_name: 'Oats' }, { food_name: 'Milk' }],
      },
      {
        id: FOOD_ID_2,
        name: 'Oatmeal Cookies',
        description: null,
        foods: [],
      },
    ]);

    const result = await tools.sparky_manage_food.execute!(
      { action: 'search_meal', meal_name: 'oat' },
      opts
    );

    expect(result).toBe(
      `# Meal Search: "oat"\n\n**Overnight Oats** — Easy breakfast\n  Foods: 2 items (Oats, Milk)\n  ID: ${MEAL_ID}\n\n**Oatmeal Cookies**\n  Foods: 0 items\n  ID: ${FOOD_ID_2}`
    );
    expect(mealService.searchMeals).toHaveBeenCalledWith('user-1', 'oat');
  });

  it('marks linked sub-meal ingredients distinctly from foods', async () => {
    vi.mocked(mealService.searchMeals).mockResolvedValue([
      {
        id: MEAL_ID,
        name: 'Big Bowl',
        description: null,
        foods: [
          { food_name: 'Chicken' },
          { item_type: 'meal', child_meal_name: 'Egg Fried Rice' },
        ],
      },
    ]);

    const result = await tools.sparky_manage_food.execute!(
      { action: 'search_meal', meal_name: 'bowl' },
      opts
    );

    expect(result).toBe(
      `# Meal Search: "bowl"\n\n**Big Bowl**\n  Foods: 2 items (Chicken, [meal] Egg Fried Rice)\n  ID: ${MEAL_ID}`
    );
  });
});

describe('log_meal', () => {
  it('requires meal_id or meal_name', async () => {
    const result = await tools.sparky_manage_food.execute!(
      { action: 'log_meal', meal_type: 'breakfast', entry_date: '2026-06-10' },
      opts
    );
    expect(result).toBe(
      'Error [VALIDATION]: Either meal_id or meal_name must be provided'
    );
  });

  it('resolves the meal by exact-insensitive name and logs with v2 serving semantics', async () => {
    vi.mocked(mealService.searchMeals).mockResolvedValue([
      { id: FOOD_ID_2, name: 'Overnight Oats Deluxe', foods: [] },
      { id: MEAL_ID, name: 'Overnight Oats', foods: [] },
    ]);
    vi.mocked(foodEntryService.createFoodEntryMeal).mockResolvedValue({
      id: ENTRY_ID,
    });

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'log_meal',
        meal_name: 'overnight oats',
        meal_type: 'breakfast',
        entry_date: '2026-06-10',
      },
      opts
    );

    expect(result).toBe(
      '✅ Meal "Overnight Oats" logged for breakfast on 2026-06-10.'
    );
    expect(foodEntryService.createFoodEntryMeal).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      {
        user_id: 'user-1',
        meal_template_id: MEAL_ID,
        meal_type: 'breakfast',
        entry_date: '2026-06-10',
        name: 'Overnight Oats',
        quantity: 1,
        unit: 'serving',
        _clientMealModelVersion: 2,
      }
    );
  });

  it('reports an unknown meal name', async () => {
    vi.mocked(mealService.searchMeals).mockResolvedValue([]);

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'log_meal',
        meal_name: 'Mystery Meal',
        meal_type: 'dinner',
        entry_date: '2026-06-10',
      },
      opts
    );

    expect(result).toBe('Error [VALIDATION]: Meal "Mystery Meal" not found.');
  });

  it('reports an unknown meal id', async () => {
    vi.mocked(mealService.getMealById).mockRejectedValue(
      new Error('Meal not found.')
    );

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'log_meal',
        meal_id: MEAL_ID,
        meal_type: 'dinner',
        entry_date: '2026-06-10',
      },
      opts
    );

    expect(result).toBe(
      `Error [VALIDATION]: Meal with ID "${MEAL_ID}" not found.`
    );
  });
});

describe('list_diary', () => {
  it('renders grouped entries with scaled nutrition and the energy total', async () => {
    vi.mocked(foodEntryService.getFoodEntriesByDate).mockResolvedValue([
      {
        id: ENTRY_ID,
        food_name: 'Oatmeal',
        quantity: 50,
        unit: 'g',
        serving_size: 100,
        serving_unit: 'g',
        meal_type: 'breakfast',
        calories: 380,
        protein: 13,
        carbs: 67,
        fat: 7,
      },
      {
        id: FOOD_ID_2,
        food_name: 'Banana',
        quantity: 2,
        unit: 'serving',
        serving_size: 1,
        serving_unit: 'serving',
        meal_type: 'snacks',
        calories: 89,
        protein: 1.1,
        carbs: 23,
        fat: 0.3,
      },
    ]);
    vi.mocked(
      foodEntryMealRepository.getFoodEntryMealsByDate
    ).mockResolvedValue([
      {
        id: MEAL_ID,
        name: 'Protein Shake',
        quantity: 1,
        meal_type: 'breakfast',
      },
    ]);

    const result = await tools.sparky_manage_food.execute!(
      { action: 'list_diary', entry_date: '2026-06-10' },
      opts
    );

    expect(result).toBe(
      `# Food Diary: 2026-06-10\n\n## Breakfast\n- **Oatmeal** — 50 g (190 kcal)\n  ID: ${ENTRY_ID} | Type: food_entry\n- **Protein Shake** (meal template) — 1x\n  ID: ${MEAL_ID} | Type: food_entry_meal\n\n## Snacks\n- **Banana** — 2 serving (178 kcal)\n  ID: ${FOOD_ID_2} | Type: food_entry\n\n---\n**Total Energy:** 368 kcal`
    );
  });

  it('defaults to today and renders the empty state', async () => {
    vi.mocked(foodEntryService.getFoodEntriesByDate).mockResolvedValue([]);
    vi.mocked(
      foodEntryMealRepository.getFoodEntryMealsByDate
    ).mockResolvedValue([]);

    const result = await tools.sparky_manage_food.execute!(
      { action: 'list_diary' },
      opts
    );

    expect(result).toBe(
      '# Food Diary: Today\n\nNo entries found for this date.'
    );
    expect(foodEntryService.getFoodEntriesByDate).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      todayInZone('UTC')
    );
  });

  it("computes the default 'today' in the user's timezone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T20:00:00Z'));
    try {
      vi.mocked(foodEntryService.getFoodEntriesByDate).mockResolvedValue([]);
      vi.mocked(
        foodEntryMealRepository.getFoodEntryMealsByDate
      ).mockResolvedValue([]);

      const tokyoTools = buildFoodTools('user-1', 'Asia/Tokyo');
      await tokyoTools.sparky_manage_food.execute!(
        { action: 'list_diary' },
        opts
      );
      expect(foodEntryService.getFoodEntriesByDate).toHaveBeenLastCalledWith(
        'user-1',
        'user-1',
        '2026-06-11'
      );

      const utcTools = buildFoodTools('user-1', 'UTC');
      await utcTools.sparky_manage_food.execute!(
        { action: 'list_diary' },
        opts
      );
      expect(foodEntryService.getFoodEntriesByDate).toHaveBeenLastCalledWith(
        'user-1',
        'user-1',
        '2026-06-10'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('converts displayed calories when the user prefers kJ', async () => {
    vi.mocked(preferenceService.getUserPreferences).mockResolvedValue({
      energy_unit: 'kJ',
    });
    vi.mocked(foodEntryService.getFoodEntriesByDate).mockResolvedValue([
      {
        id: ENTRY_ID,
        food_name: 'Oatmeal',
        quantity: 50,
        unit: 'g',
        serving_size: 100,
        serving_unit: 'g',
        meal_type: 'breakfast',
        calories: 380,
        protein: 13,
        carbs: 67,
        fat: 7,
      },
    ]);
    vi.mocked(
      foodEntryMealRepository.getFoodEntryMealsByDate
    ).mockResolvedValue([]);

    const result = await tools.sparky_manage_food.execute!(
      { action: 'list_diary', entry_date: '2026-06-10' },
      opts
    );

    // 380 kcal × 0.5 = 190 kcal → ×4.184 = 794.96 → rounded 795 kJ
    expect(result).toBe(
      `# Food Diary: 2026-06-10\n\n## Breakfast\n- **Oatmeal** — 50 g (795 kJ)\n  ID: ${ENTRY_ID} | Type: food_entry\n\n---\n**Total Energy:** 795 kJ`
    );
  });
});

describe('delete_entry', () => {
  it('deletes a food entry', async () => {
    vi.mocked(foodEntryService.deleteFoodEntry).mockResolvedValue(true);

    const result = await tools.sparky_manage_food.execute!(
      { action: 'delete_entry', entry_id: ENTRY_ID, entry_type: 'food_entry' },
      opts
    );

    expect(result).toBe('✅ Entry deleted.');
    expect(foodEntryService.deleteFoodEntry).toHaveBeenCalledWith(
      'user-1',
      ENTRY_ID
    );
  });

  it('maps a missing meal entry to NOT_FOUND', async () => {
    vi.mocked(foodEntryService.deleteFoodEntryMeal).mockRejectedValue(
      new Error('Food entry meal not found or not authorized to delete.')
    );

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'delete_entry',
        entry_id: ENTRY_ID,
        entry_type: 'food_entry_meal',
      },
      opts
    );

    expect(result).toBe(
      `Error [NOT_FOUND]: Entry with ID '${ENTRY_ID}' not found.\n\nSuggestion: Check the ID and try again.`
    );
  });
});

describe('delete_food', () => {
  it('requires food_id or food_name', async () => {
    const result = await tools.sparky_manage_food.execute!(
      { action: 'delete_food' },
      opts
    );
    expect(result).toBe(
      'Error [VALIDATION]: Either food_id or food_name must be provided'
    );
  });

  it('resolves by name and force-deletes', async () => {
    vi.mocked(foodRepository.getFoodsWithPagination).mockResolvedValue([
      eggsRow,
    ]);
    vi.mocked(foodCoreService.deleteFood).mockResolvedValue({
      message: 'Food and all its references deleted permanently.',
      status: 'force_deleted',
    });

    const result = await tools.sparky_manage_food.execute!(
      { action: 'delete_food', food_name: 'eggs' },
      opts
    );

    expect(result).toBe(
      '✅ Food "Eggs" deleted (including variants and diary entries).'
    );
    expect(foodCoreService.deleteFood).toHaveBeenCalledWith(
      'user-1',
      FOOD_ID,
      true
    );
  });

  it('reports the hidden outcome when other users still reference the food', async () => {
    vi.mocked(foodRepository.getFoodById).mockResolvedValue(eggsRow);
    vi.mocked(foodCoreService.deleteFood).mockResolvedValue({
      message:
        'Food hidden (marked as quick food). Existing references remain.',
      status: 'hidden',
    });

    const result = await tools.sparky_manage_food.execute!(
      { action: 'delete_food', food_id: FOOD_ID },
      opts
    );

    expect(result).toBe(
      '✅ Food "Eggs" hidden (marked as quick food). Existing references remain.'
    );
  });

  it('maps an unknown food_id to NOT_FOUND', async () => {
    vi.mocked(foodRepository.getFoodById).mockResolvedValue(undefined);

    const result = await tools.sparky_manage_food.execute!(
      { action: 'delete_food', food_id: FOOD_ID },
      opts
    );

    expect(result).toBe(
      `Error [NOT_FOUND]: Food with ID '${FOOD_ID}' not found.\n\nSuggestion: Check the ID and try again.`
    );
    expect(foodCoreService.deleteFood).not.toHaveBeenCalled();
  });
});

describe('update_entry', () => {
  it('updates a food entry quantity and unit', async () => {
    vi.mocked(foodEntryService.updateFoodEntry).mockResolvedValue({
      id: ENTRY_ID,
    });

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'update_entry',
        entry_id: ENTRY_ID,
        entry_type: 'food_entry',
        quantity: 3,
        unit: 'serving',
      },
      opts
    );

    expect(result).toBe('✅ Entry updated to 3 serving.');
    expect(foodEntryService.updateFoodEntry).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      ENTRY_ID,
      { quantity: 3, unit: 'serving' }
    );
  });

  it('round-trips the template link and foods when updating a meal entry', async () => {
    const componentFoods = [
      { food_id: FOOD_ID, variant_id: VARIANT_ID, quantity: 100, unit: 'g' },
    ];
    vi.mocked(
      foodEntryService.getFoodEntryMealWithComponents
    ).mockResolvedValue({
      id: ENTRY_ID,
      meal_template_id: MEAL_ID,
      entry_date: new Date(2026, 5, 10),
      foods: componentFoods,
    });
    vi.mocked(foodEntryService.updateFoodEntryMeal).mockResolvedValue({
      id: ENTRY_ID,
    });

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'update_entry',
        entry_id: ENTRY_ID,
        entry_type: 'food_entry_meal',
        quantity: 2,
        unit: 'serving',
      },
      opts
    );

    expect(result).toBe('✅ Entry updated to 2 serving.');
    expect(foodEntryService.updateFoodEntryMeal).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      ENTRY_ID,
      {
        meal_template_id: MEAL_ID,
        entry_date: '2026-06-10',
        quantity: 2,
        unit: 'serving',
        foods: componentFoods,
      }
    );
  });

  it('maps a missing meal entry to NOT_FOUND', async () => {
    vi.mocked(
      foodEntryService.getFoodEntryMealWithComponents
    ).mockResolvedValue(null);

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'update_entry',
        entry_id: ENTRY_ID,
        entry_type: 'food_entry_meal',
        quantity: 2,
        unit: 'serving',
      },
      opts
    );

    expect(result).toBe(
      `Error [NOT_FOUND]: Entry with ID '${ENTRY_ID}' not found.\n\nSuggestion: Check the ID and try again.`
    );
  });
});

describe('update_food_variant', () => {
  it('updates only the provided fields and renders the updated variant', async () => {
    vi.mocked(foodRepository.getFoodVariantById).mockResolvedValue({
      id: VARIANT_ID,
      food_id: FOOD_ID,
    });
    vi.mocked(foodRepository.getFoodById).mockResolvedValue({
      id: FOOD_ID,
      name: 'Oatmeal',
      user_id: 'user-1',
    });
    vi.mocked(foodRepository.updateFoodVariant).mockResolvedValue({
      id: VARIANT_ID,
      food_id: FOOD_ID,
      calories: 390,
      serving_size: 100,
      serving_unit: 'g',
    });

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'update_food_variant',
        variant_id: VARIANT_ID,
        calories: 390,
        fiber: 10,
      },
      opts
    );

    expect(result).toBe(
      '✅ Food variant updated for "Oatmeal" (390 kcal per 100g).'
    );
    expect(foodRepository.updateFoodVariant).toHaveBeenCalledWith(
      VARIANT_ID,
      { calories: 390, dietary_fiber: 10 },
      'user-1'
    );
    expect(foodCoreService.updateFoodEntriesSnapshot).not.toHaveBeenCalled();
  });

  it('refreshes diary snapshots when update_existing_entries is true', async () => {
    vi.mocked(foodRepository.getFoodVariantById).mockResolvedValue({
      id: VARIANT_ID,
      food_id: FOOD_ID,
    });
    vi.mocked(foodRepository.getFoodById).mockResolvedValue({
      id: FOOD_ID,
      name: 'Oatmeal',
      user_id: 'user-1',
    });
    vi.mocked(foodRepository.updateFoodVariant).mockResolvedValue({
      id: VARIANT_ID,
      food_id: FOOD_ID,
      calories: 390,
      serving_size: 100,
      serving_unit: 'g',
    });
    vi.mocked(foodCoreService.updateFoodEntriesSnapshot).mockResolvedValue({
      message: 'Food entries updated successfully.',
    });

    await tools.sparky_manage_food.execute!(
      {
        action: 'update_food_variant',
        variant_id: VARIANT_ID,
        calories: 390,
        update_existing_entries: true,
      },
      opts
    );

    expect(foodCoreService.updateFoodEntriesSnapshot).toHaveBeenCalledWith(
      'user-1',
      FOOD_ID,
      VARIANT_ID
    );
  });

  it('rejects a default-variant lookup on a food the user does not own', async () => {
    vi.mocked(foodRepository.getFoodById).mockResolvedValue({
      id: FOOD_ID,
      name: 'Eggs',
      user_id: 'someone-else',
      default_variant: { id: VARIANT_ID },
    });

    const result = await tools.sparky_manage_food.execute!(
      { action: 'update_food_variant', food_id: FOOD_ID, calories: 100 },
      opts
    );

    expect(result).toBe(
      `Error [VALIDATION]: Default variant for food_id "${FOOD_ID}" not found or not editable.`
    );
  });

  it('returns a DB error when neither id is provided (MCP quirk)', async () => {
    const result = await tools.sparky_manage_food.execute!(
      { action: 'update_food_variant', calories: 100 },
      opts
    );
    expect(result).toBe(DB_ERROR_TEXT);
  });

  it('returns a DB error when no updatable field is provided (MCP quirk)', async () => {
    vi.mocked(foodRepository.getFoodVariantById).mockResolvedValue({
      id: VARIANT_ID,
      food_id: FOOD_ID,
    });
    vi.mocked(foodRepository.getFoodById).mockResolvedValue({
      id: FOOD_ID,
      name: 'Oatmeal',
      user_id: 'user-1',
    });

    const result = await tools.sparky_manage_food.execute!(
      { action: 'update_food_variant', variant_id: VARIANT_ID },
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
    expect(foodRepository.updateFoodVariant).not.toHaveBeenCalled();
  });
});

describe('copy_from_yesterday', () => {
  it('defaults to copying all of yesterday into today', async () => {
    const today = todayInZone('UTC');
    const yesterday = addDays(today, -1);
    vi.mocked(foodEntryService.copyAllFoodEntries).mockResolvedValue([
      {},
      {},
      {},
    ]);

    const result = await tools.sparky_manage_food.execute!(
      { action: 'copy_from_yesterday' },
      opts
    );

    expect(result).toBe(`✅ Copied 3 entries to ${today}.`);
    expect(foodEntryService.copyAllFoodEntries).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      yesterday,
      today
    );
  });

  it('copies a single meal slot and reports an empty source', async () => {
    vi.mocked(foodEntryService.copyFoodEntries).mockResolvedValue([]);

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'copy_from_yesterday',
        source_date: '2026-06-09',
        target_date: '2026-06-10',
        meal_type: 'breakfast',
      },
      opts
    );

    expect(result).toBe('✅ No entries found to copy from the source date.');
    expect(foodEntryService.copyFoodEntries).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      '2026-06-09',
      'breakfast',
      '2026-06-10',
      'breakfast'
    );
  });
});

describe('save_as_meal_template', () => {
  it('saves the slot as a template and counts its foods', async () => {
    vi.mocked(mealService.createMealFromDiaryEntries).mockResolvedValue({
      id: MEAL_ID,
      name: 'My Lunch',
    });
    vi.mocked(mealService.getMealById).mockResolvedValue({
      id: MEAL_ID,
      name: 'My Lunch',
      foods: [{}, {}],
    });

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'save_as_meal_template',
        entry_date: '2026-06-10',
        meal_type: 'lunch',
        meal_name: 'My Lunch',
      },
      opts
    );

    expect(result).toBe('✅ Meal template "My Lunch" saved with 2 food items.');
    expect(mealService.createMealFromDiaryEntries).toHaveBeenCalledWith(
      'user-1',
      '2026-06-10',
      'lunch',
      'My Lunch',
      null
    );
  });

  it('surfaces an empty slot as a DB error (message lacks "not found")', async () => {
    vi.mocked(mealService.createMealFromDiaryEntries).mockRejectedValue(
      new Error('No food entries found for lunch on 2026-06-10.')
    );

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'save_as_meal_template',
        entry_date: '2026-06-10',
        meal_type: 'lunch',
        meal_name: 'My Lunch',
      },
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });
});

describe('log_water', () => {
  it('inserts a manual water entry and syncs the aggregated daily total', async () => {
    vi.mocked(measurementRepository.insertWaterIntakeLog).mockResolvedValue({
      id: ENTRY_ID,
    });
    vi.mocked(measurementRepository.getWaterIntakeByDate).mockResolvedValue({
      water_ml: 250,
    });

    const result = await tools.sparky_manage_food.execute!(
      { action: 'log_water', amount_ml: 500, entry_date: '2026-06-11' },
      opts
    );

    expect(result).toBe('✅ Logged 500ml water for 2026-06-11.');
    expect(measurementRepository.insertWaterIntakeLog).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      '2026-06-11',
      500,
      null,
      null,
      'manual'
    );
    // The aggregated water_intake row (read by the dashboard) must be updated
    // to include the newly logged amount: existing 250ml + 500ml = 750ml.
    expect(measurementRepository.upsertWaterData).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      750,
      '2026-06-11',
      'manual'
    );
  });
});

describe('get_nutritional_summary', () => {
  it('renders per-day macro breakdowns with the conditional Other line', async () => {
    vi.mocked(reportRepository.getDailyNutritionTotalsRange).mockResolvedValue([
      {
        entry_date: new Date(2026, 5, 1),
        calories: 1850.5,
        protein: 95.2,
        carbs: 210,
        fat: 65.5,
        saturated_fat: 12,
        polyunsaturated_fat: 8,
        monounsaturated_fat: 20,
        trans_fat: 0,
        cholesterol: 180,
        sodium: 2300,
        potassium: 3400,
        fiber: 25,
        sugar: 48,
        vitamin_a: 80,
        vitamin_c: 60,
        calcium: 90,
        iron: 70,
      },
      {
        entry_date: new Date(2026, 5, 2),
        calories: 1500,
        protein: 80,
        carbs: 180,
        fat: 50,
        saturated_fat: 0,
        cholesterol: 0,
        sodium: 1800,
        potassium: 0,
        fiber: 20,
        sugar: 30,
      },
    ]);

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'get_nutritional_summary',
        start_date: '2026-06-01',
        end_date: '2026-06-07',
      },
      opts
    );

    expect(result).toBe(
      '# Nutritional Summary (2026-06-01 to 2026-06-07)\n\n**2026-06-01**:\n  Macros: 1850.5 kcal | P: 95.2g | C: 210g | F: 65.5g\n  Fiber: 25g | Sugar: 48g | Sodium: 2300mg\n  Other: SatFat: 12g | Chol: 180mg | Potas: 3400mg\n\n**2026-06-02**:\n  Macros: 1500 kcal | P: 80g | C: 180g | F: 50g\n  Fiber: 20g | Sugar: 30g | Sodium: 1800mg\n'
    );
    expect(reportRepository.getDailyNutritionTotalsRange).toHaveBeenCalledWith(
      'user-1',
      '2026-06-01',
      '2026-06-07'
    );
  });

  it('converts calories to kJ when the user prefers it', async () => {
    vi.mocked(preferenceService.getUserPreferences).mockResolvedValue({
      energy_unit: 'kJ',
    });
    vi.mocked(reportRepository.getDailyNutritionTotalsRange).mockResolvedValue([
      {
        entry_date: new Date(2026, 5, 1),
        calories: 1000,
        protein: 80,
        carbs: 100,
        fat: 30,
        sodium: 1500,
        fiber: 20,
        sugar: 25,
      },
    ]);

    const result = await tools.sparky_manage_food.execute!(
      {
        action: 'get_nutritional_summary',
        start_date: '2026-06-01',
        end_date: '2026-06-01',
      },
      opts
    );

    expect(result).toBe(
      '# Nutritional Summary (2026-06-01 to 2026-06-01)\n\n**2026-06-01**:\n  Macros: 4184 kJ | P: 80g | C: 100g | F: 30g\n  Fiber: 20g | Sugar: 25g | Sodium: 1500mg\n'
    );
  });
});

describe('get_water_history', () => {
  it('renders daily totals in ml', async () => {
    vi.mocked(
      measurementRepository.getWaterTotalsByDateRange
    ).mockResolvedValue([
      { entry_date: new Date(2026, 5, 10), total_ml: '2500' },
      { entry_date: new Date(2026, 5, 11), total_ml: '1800' },
    ]);

    const result = await tools.sparky_manage_food.execute!(
      { action: 'get_water_history', start_date: '2026-06-10' },
      opts
    );

    expect(result).toBe(
      '# Water Intake History\n\n**2026-06-10**: 2500 ml\n\n**2026-06-11**: 1800 ml'
    );
    expect(
      measurementRepository.getWaterTotalsByDateRange
    ).toHaveBeenCalledWith('user-1', '2026-06-10', undefined);
  });

  it('converts totals to oz when the user prefers it', async () => {
    vi.mocked(preferenceService.getUserPreferences).mockResolvedValue({
      water_display_unit: 'oz',
    });
    vi.mocked(
      measurementRepository.getWaterTotalsByDateRange
    ).mockResolvedValue([
      { entry_date: new Date(2026, 5, 10), total_ml: '591' },
    ]);

    const result = await tools.sparky_manage_food.execute!(
      { action: 'get_water_history' },
      opts
    );

    expect(result).toBe('# Water Intake History\n\n**2026-06-10**: 20 oz');
  });
});

describe('service errors surface as tool error strings', () => {
  it('maps an unexpected service failure to DB_ERROR', async () => {
    vi.mocked(foodEntryService.getFoodEntriesByDate).mockRejectedValue(
      new Error('connection refused')
    );

    const result = await tools.sparky_manage_food.execute!(
      { action: 'list_diary', entry_date: '2026-06-10' },
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });
});

describe('sparky_list_foods', () => {
  it('returns the paginated catalog with the default variant folded into variants', async () => {
    vi.mocked(foodRepository.getFoodsWithPagination).mockResolvedValue([
      {
        id: FOOD_ID,
        name: 'Eggs',
        brand: null,
        is_custom: true,
        user_id: 'user-1',
        default_variant: { id: VARIANT_ID, calories: 155 },
      },
      {
        id: FOOD_ID_2,
        name: 'Quick Add',
        brand: null,
        is_custom: true,
        user_id: 'user-1',
        default_variant: { id: null },
      },
    ]);
    vi.mocked(foodRepository.countFoods).mockResolvedValue(2);

    const result = await tools.sparky_list_foods.execute!(
      { search: 'egg' },
      opts
    );

    // Compact render; per-row projection drops null `brand` and redundant `user_id`.
    expect(result).toBe(
      JSON.stringify({
        data: [
          {
            id: FOOD_ID,
            name: 'Eggs',
            is_custom: true,
            variants: [{ id: VARIANT_ID, calories: 155 }],
          },
          {
            id: FOOD_ID_2,
            name: 'Quick Add',
            is_custom: true,
            variants: [],
          },
        ],
        has_more: false,
        next_offset: null,
        total_count: 2,
      })
    );
    expect(foodRepository.getFoodsWithPagination).toHaveBeenCalledWith(
      'egg',
      null,
      'user-1',
      20,
      0,
      null
    );
  });
});

describe('sparky_get_food_details', () => {
  it('returns the food with all variants', async () => {
    vi.mocked(foodCoreService.getFoodById).mockResolvedValue({
      id: FOOD_ID,
      name: 'Eggs',
      brand: 'Farm Fresh',
      default_variant: { id: VARIANT_ID },
    });
    vi.mocked(foodRepository.getFoodVariantsByFoodId).mockResolvedValue([
      { id: VARIANT_ID, serving_unit: 'g' },
      { id: FOOD_ID_2, serving_unit: 'serving' },
    ]);

    const result = await tools.sparky_get_food_details.execute!(
      { food_id: FOOD_ID },
      opts
    );

    expect(result).toBe(
      JSON.stringify({
        id: FOOD_ID,
        name: 'Eggs',
        brand: 'Farm Fresh',
        variants: [
          { id: VARIANT_ID, serving_unit: 'g' },
          { id: FOOD_ID_2, serving_unit: 'serving' },
        ],
      })
    );
  });

  it('maps a missing food to NOT_FOUND', async () => {
    vi.mocked(foodCoreService.getFoodById).mockRejectedValue(
      new Error('Food not found.')
    );

    const result = await tools.sparky_get_food_details.execute!(
      { food_id: FOOD_ID },
      opts
    );

    expect(result).toBe(
      `Error [NOT_FOUND]: Food with ID '${FOOD_ID}' not found.\n\nSuggestion: Check the ID and try again.`
    );
  });
});

describe('sparky_search_foods', () => {
  it('requires a query', async () => {
    const result = await tools.sparky_search_foods.execute!(
      {} as { query: string },
      opts
    );
    expect(result).toBe(
      'Error [VALIDATION]: query: Invalid input: expected string, received undefined'
    );
  });

  it('searches the catalog by name', async () => {
    vi.mocked(foodRepository.getFoodsWithPagination).mockResolvedValue([]);
    vi.mocked(foodRepository.countFoods).mockResolvedValue(0);

    const result = await tools.sparky_search_foods.execute!(
      { query: 'egg', limit: 5 },
      opts
    );

    expect(result).toBe(
      JSON.stringify({
        data: [],
        has_more: false,
        next_offset: null,
        total_count: 0,
      })
    );
    expect(foodRepository.getFoodsWithPagination).toHaveBeenCalledWith(
      'egg',
      null,
      'user-1',
      5,
      0,
      null
    );
  });
});

describe('sparky_get_food_diary', () => {
  it('uses a single date for both range bounds and returns entries plus meals', async () => {
    const foodEntries = [{ id: ENTRY_ID, food_name: 'Eggs' }];
    const mealEntries = [{ id: MEAL_ID, name: 'Protein Shake' }];
    vi.mocked(foodEntryService.getFoodEntriesByDateRange).mockResolvedValue(
      foodEntries
    );
    vi.mocked(
      foodEntryMealRepository.getFoodEntryMealsByDateRange
    ).mockResolvedValue(mealEntries);

    const result = await tools.sparky_get_food_diary.execute!(
      { date: '2026-06-10' },
      opts
    );

    expect(result).toBe(
      JSON.stringify({
        start_date: '2026-06-10',
        end_date: '2026-06-10',
        food_entries: foodEntries,
        meal_entries: mealEntries,
      })
    );
    expect(foodEntryService.getFoodEntriesByDateRange).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      '2026-06-10',
      '2026-06-10'
    );
    expect(
      foodEntryMealRepository.getFoodEntryMealsByDateRange
    ).toHaveBeenCalledWith('user-1', '2026-06-10', '2026-06-10');
  });

  it('compacts the payload: single line, null/empty/redundant fields dropped, actionable ids kept', async () => {
    vi.mocked(foodEntryService.getFoodEntriesByDateRange).mockResolvedValue([
      {
        id: ENTRY_ID,
        food_id: FOOD_ID,
        meal_id: null,
        meal_type: 'Breakfast',
        meal_type_id: '99999999-9999-4999-8999-999999999999',
        quantity: 2,
        unit: 'serving',
        variant_id: VARIANT_ID,
        entry_date: '2026-06-10',
        meal_plan_template_id: null,
        food_entry_meal_id: null,
        food_name: 'Eggs',
        brand_name: null,
        calories: 155,
        protein: 13,
        vitamin_a: null,
        vitamin_c: null,
        custom_nutrients: {},
      },
    ]);
    vi.mocked(
      foodEntryMealRepository.getFoodEntryMealsByDateRange
    ).mockResolvedValue([
      {
        id: MEAL_ID,
        user_id: 'user-1',
        name: 'Protein Shake',
        meal_type: 'Snacks',
        quantity: 1,
        entry_date: '2026-06-10',
        created_at: '2026-06-10T08:00:00.000Z',
        updated_at: '2026-06-10T08:00:00.000Z',
        created_by_user_id: 'user-1',
        updated_by_user_id: 'user-1',
        meal_template_id: null,
        meal_type_id: '99999999-9999-4999-8999-999999999999',
        legacy_serving_unit_math: false,
      },
    ]);

    const result = await tools.sparky_get_food_diary.execute!(
      { date: '2026-06-10' },
      opts
    );

    // Compact render: no pretty-print whitespace.
    expect(result).not.toContain('\n');

    const parsed = JSON.parse(result as string);
    const entry = parsed.food_entries[0];
    // Actionable ids kept.
    expect(entry.id).toBe(ENTRY_ID);
    expect(entry.food_id).toBe(FOOD_ID);
    // Populated nutrients kept.
    expect(entry).toMatchObject({
      food_name: 'Eggs',
      calories: 155,
      protein: 13,
    });
    // Nulls, empty objects, and redundant internal surrogate keys dropped.
    for (const dropped of [
      'meal_id',
      'brand_name',
      'vitamin_a',
      'vitamin_c',
      'custom_nutrients',
      'meal_type_id',
      'variant_id',
      'meal_plan_template_id',
      'food_entry_meal_id',
    ]) {
      expect(entry).not.toHaveProperty(dropped);
    }
    // Human-readable label kept in place of meal_type_id.
    expect(entry.meal_type).toBe('Breakfast');

    const meal = parsed.meal_entries[0];
    expect(meal).toMatchObject({
      id: MEAL_ID,
      name: 'Protein Shake',
      meal_type: 'Snacks',
    });
    for (const dropped of [
      'user_id',
      'created_at',
      'updated_at',
      'created_by_user_id',
      'updated_by_user_id',
      'meal_template_id',
      'meal_type_id',
      'legacy_serving_unit_math',
    ]) {
      expect(meal).not.toHaveProperty(dropped);
    }
  });
});

describe('sparky_get_nutrition_summary', () => {
  it('defaults the range to today', async () => {
    const today = todayInZone('UTC');
    vi.mocked(reportRepository.getDailyNutritionTotalsRange).mockResolvedValue(
      []
    );

    const result = await tools.sparky_get_nutrition_summary.execute!({}, opts);

    expect(result).toBe('[]');
    expect(reportRepository.getDailyNutritionTotalsRange).toHaveBeenCalledWith(
      'user-1',
      today,
      today
    );
  });
});

describe('sparky_get_recent_food_entries', () => {
  it('clamps the limit to 200', async () => {
    vi.mocked(foodRepository.getRecentFoodEntries).mockResolvedValue([]);

    const result = await tools.sparky_get_recent_food_entries.execute!(
      { limit: 200 },
      opts
    );

    expect(result).toBe('[]');
    expect(foodRepository.getRecentFoodEntries).toHaveBeenCalledWith(
      'user-1',
      200
    );
  });
});

describe('sparky_get_food_usage', () => {
  it('returns paginated usage rows with today as the default range', async () => {
    const today = todayInZone('UTC');
    const rows = [{ id: ENTRY_ID, food_id: FOOD_ID }];
    vi.mocked(foodRepository.getFoodUsage).mockResolvedValue({
      rows,
      totalCount: 1,
    });

    const result = await tools.sparky_get_food_usage.execute!(
      { food_id: FOOD_ID },
      opts
    );

    expect(result).toBe(
      JSON.stringify({
        data: rows,
        has_more: false,
        next_offset: null,
        total_count: 1,
      })
    );
    expect(foodRepository.getFoodUsage).toHaveBeenCalledWith(
      'user-1',
      FOOD_ID,
      today,
      today,
      20,
      0
    );
  });
});
