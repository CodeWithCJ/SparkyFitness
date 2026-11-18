import { beforeEach, describe, expect, it, vi } from 'vitest';
import foodEntryService, {
  copyFoodEntries,
} from '../services/foodEntryService.js';
import foodRepository from '../models/foodRepository.js';
import mealTypeRepository from '../models/mealType.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../models/foodRepository.js', () => ({
  default: {
    createFoodEntry: vi.fn(),
    getFoodEntryOwnerId: vi.fn(),
    getFoodEntryById: vi.fn(),
    getFoodById: vi.fn(),
    getFoodVariantById: vi.fn(),
    updateFoodEntry: vi.fn(),
    getLastCookedFoodEntry: vi.fn(),
    getFoodEntriesByDateAndMealType: vi.fn(),
    getFoodEntryByDetails: vi.fn(),
    bulkCreateFoodEntries: vi.fn(),
  },
}));
vi.mock('../models/mealType.js');
vi.mock('../models/foodEntryMealRepository');
vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const ENTRY_ID = '33333333-3333-4333-8333-333333333333';

/** Rice logged cooked: 300 g on the plate, 120 g raw (2.5x). */
const cookedEntry = {
  id: ENTRY_ID,
  food_id: null,
  variant_id: null,
  meal_type_id: '66666666-6666-4666-8666-666666666666',
  quantity: 120,
  unit: 'g',
  cooked_quantity: 300,
  entry_date: '2026-11-13',
  entry_time: null,
  notes: null,
  food_name: 'Rice, dry',
  brand_name: null,
  serving_size: 100,
  serving_unit: 'g',
  calories: 360,
};

function storedEntry(overrides: Record<string, unknown> = {}) {
  vi.mocked(foodRepository.getFoodEntryOwnerId).mockResolvedValue('user-1');
  vi.mocked(foodRepository.getFoodEntryById).mockResolvedValue({
    ...cookedEntry,
    ...overrides,
  });
  vi.mocked(foodRepository.updateFoodEntry).mockResolvedValue(cookedEntry);
  vi.mocked(getClient).mockRejectedValue(new Error('no linked water entry'));
}

async function updatedCookedQuantity(body: Record<string, unknown>) {
  await foodEntryService.updateFoodEntry('user-1', 'user-1', ENTRY_ID, body);
  return vi.mocked(foodRepository.updateFoodEntry).mock.calls[0]![3]
    .cooked_quantity;
}

describe('cooked_quantity on create (#3534)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(foodRepository.createFoodEntry).mockResolvedValue({ id: 'new' });
  });

  it('passes a cooked weight for a weight unit through', async () => {
    await foodEntryService.createFoodEntry('user-1', 'user-1', {
      quantity: 120,
      unit: 'g',
      cooked_quantity: 300,
    });
    expect(foodRepository.createFoodEntry).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 120, cooked_quantity: 300 }),
      'user-1'
    );
  });

  it('rejects a cooked weight on a non-weight unit with 400', async () => {
    await expect(
      foodEntryService.createFoodEntry('user-1', 'user-1', {
        quantity: 1,
        unit: 'cup',
        cooked_quantity: 150,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(foodRepository.createFoodEntry).not.toHaveBeenCalled();
  });

  it('allows null on any unit', async () => {
    await foodEntryService.createFoodEntry('user-1', 'user-1', {
      quantity: 1,
      unit: 'cup',
      cooked_quantity: null,
    });
    expect(foodRepository.createFoodEntry).toHaveBeenCalled();
  });
});

describe('cooked_quantity on update (#3534)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storedEntry();
  });

  it('keeps the stored value when neither quantity nor unit change', async () => {
    // The image route and a note edit send neither key.
    expect(await updatedCookedQuantity({ notes: 'leftovers' })).toBe(300);
  });

  it('keeps it when the web edit dialog resends the same quantity and unit', async () => {
    expect(
      await updatedCookedQuantity({ quantity: 120, unit: 'g', notes: null })
    ).toBe(300);
  });

  it('takes a new value sent together with the quantity', async () => {
    expect(
      await updatedCookedQuantity({ quantity: 80, cooked_quantity: 200 })
    ).toBe(200);
  });

  it('clears it when the quantity changes on its own', async () => {
    // Jerrys-modz in #3534: a stale cooked weight would skew the next factor.
    expect(await updatedCookedQuantity({ quantity: 150 })).toBeNull();
  });

  it('clears it when the unit changes on its own', async () => {
    expect(
      await updatedCookedQuantity({ quantity: 120, unit: 'oz' })
    ).toBeNull();
  });

  it('clears it on an explicit null', async () => {
    expect(await updatedCookedQuantity({ cooked_quantity: null })).toBeNull();
  });

  it('rejects a cooked weight sent for a non-weight unit', async () => {
    await expect(
      foodEntryService.updateFoodEntry('user-1', 'user-1', ENTRY_ID, {
        quantity: 1,
        unit: 'cup',
        cooked_quantity: 150,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(foodRepository.updateFoodEntry).not.toHaveBeenCalled();
  });

  it('stays null for an entry that was never weighed cooked', async () => {
    storedEntry({ cooked_quantity: null });
    expect(await updatedCookedQuantity({ notes: 'x' })).toBeNull();
  });
});

describe('getLastCookedFoodEntry (#3534)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps the row to the API shape', async () => {
    vi.mocked(foodRepository.getLastCookedFoodEntry).mockResolvedValue({
      id: 'entry-9',
      entry_date: '2026-11-13',
      quantity: '120',
      unit: 'g',
      cooked_quantity: '300',
    });
    await expect(
      foodEntryService.getLastCookedFoodEntry('user-1', 'food-1')
    ).resolves.toEqual({
      id: 'entry-9',
      entry_date: '2026-11-13',
      quantity: 120,
      unit: 'g',
      cooked_quantity: 300,
    });
  });

  it('returns null when there is none', async () => {
    vi.mocked(foodRepository.getLastCookedFoodEntry).mockResolvedValue(null);
    await expect(
      foodEntryService.getLastCookedFoodEntry('user-1', 'food-1')
    ).resolves.toBeNull();
  });
});

describe('copying a meal keeps cooked_quantity (#3534)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
      { id: 'meal-lunch', name: 'Lunch', user_id: null },
    ]);
    vi.mocked(foodRepository.getFoodEntryByDetails).mockResolvedValue(
      undefined
    );
    vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue([]);
  });

  it('carries the cooked weight to the copied entry', async () => {
    vi.mocked(foodRepository.getFoodEntriesByDateAndMealType).mockResolvedValue(
      [
        { ...cookedEntry, food_id: 'food-rice', food_entry_meal_id: null },
        {
          ...cookedEntry,
          id: 'milk',
          food_id: 'food-milk',
          unit: 'cup',
          quantity: 1,
          cooked_quantity: null,
          food_entry_meal_id: null,
        },
      ]
    );
    await copyFoodEntries(
      'user-1',
      'user-1',
      '2026-11-13',
      'Lunch',
      '2026-11-14',
      'Lunch'
    );
    expect(foodRepository.bulkCreateFoodEntries).toHaveBeenCalledWith(
      [
        expect.objectContaining({ food_id: 'food-rice', cooked_quantity: 300 }),
        expect.objectContaining({
          food_id: 'food-milk',
          cooked_quantity: null,
        }),
      ],
      'user-1'
    );
  });
});
