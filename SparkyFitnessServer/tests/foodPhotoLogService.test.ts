import { vi, beforeEach, describe, expect, it } from 'vitest';

const queryMock = vi.fn();
const releaseMock = vi.fn();
const getClientMock = vi.fn(async () => ({
  query: queryMock,
  release: releaseMock,
}));

vi.mock('../db/poolManager.js', () => ({
  getClient: (...args: unknown[]) => getClientMock(...(args as [])),
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const createFoodWithClientMock = vi.fn();
vi.mock('../models/food.js', () => ({
  createFoodWithClient: (...args: unknown[]) =>
    createFoodWithClientMock(...(args as [])),
}));

const createFoodEntryMealWithClientMock = vi.fn();
const resolveMealTypeIdWithClientMock = vi.fn();
vi.mock('../models/foodEntryMealRepository.js', () => ({
  createFoodEntryMealWithClient: (...args: unknown[]) =>
    createFoodEntryMealWithClientMock(...(args as [])),
  resolveMealTypeIdWithClient: (...args: unknown[]) =>
    resolveMealTypeIdWithClientMock(...(args as [])),
}));

const bulkCreateFoodEntriesWithClientMock = vi.fn();
vi.mock('../models/foodEntry.js', () => ({
  bulkCreateFoodEntriesWithClient: (...args: unknown[]) =>
    bulkCreateFoodEntriesWithClientMock(...(args as [])),
}));

const { createPhotoLoggedMeal, PhotoLogError } =
  await import('../services/foodPhotoLogService.js');

const MEAL_TYPE_ID = '77777777-7777-4777-8777-777777777777';
const EXISTING_FOOD_ID = '11111111-1111-4111-8111-111111111111';
const EXISTING_VARIANT_ID = '22222222-2222-4222-8222-222222222222';

const existingVariantRow = {
  food_id: EXISTING_FOOD_ID,
  food_name: 'Chicken Thigh',
  brand: null,
  variant_id: EXISTING_VARIANT_ID,
  serving_size: 100,
  serving_unit: 'g',
  calories: 199,
  protein: 26,
  carbs: 0,
  fat: 10,
  saturated_fat: 3,
  polyunsaturated_fat: null,
  monounsaturated_fat: null,
  trans_fat: null,
  cholesterol: null,
  sodium: null,
  potassium: null,
  dietary_fiber: null,
  sugars: null,
  vitamin_a: null,
  vitamin_c: null,
  calcium: null,
  iron: null,
  glycemic_index: null,
  custom_nutrients: null,
};

const NEW_FOOD = {
  name: 'Steamed broccoli',
  brand: null,
  serving_size: 100,
  serving_unit: 'g',
  calories: 104.7,
  protein: 3.5,
  carbs: 8.2,
  fat: 1.2,
};

function payload(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'grouped',
    entry_date: '2026-08-27',
    entry_time: null,
    meal_type: 'lunch',
    meal_type_id: null,
    name: 'Grilled chicken with rice and broccoli',
    description: null,
    items: [
      {
        source: 'existing',
        food_id: EXISTING_FOOD_ID,
        variant_id: EXISTING_VARIANT_ID,
        quantity: 145,
        unit: 'g',
      },
      { source: 'new', food: NEW_FOOD, quantity: 85, unit: 'g' },
    ],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

/** SQL keywords issued on the transaction client, in order. */
function txSteps(): string[] {
  return queryMock.mock.calls
    .map((call) => String(call[0]).trim().toUpperCase())
    .filter((sql) => sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK');
}

describe('createPhotoLoggedMeal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveMealTypeIdWithClientMock.mockResolvedValue(MEAL_TYPE_ID);
    queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('FROM food_variants')) {
        return { rows: [existingVariantRow] };
      }
      return { rows: [] };
    });
    createFoodWithClientMock.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Steamed broccoli',
      default_variant: { id: '66666666-6666-4666-8666-666666666666' },
    });
    createFoodEntryMealWithClientMock.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
    });
    bulkCreateFoodEntriesWithClientMock.mockResolvedValue([
      { id: '44444444-4444-4444-8444-444444444444' },
      { id: '44444444-4444-4444-8444-444444444445' },
    ]);
  });

  it('commits once and returns the created ids', async () => {
    const result = await createPhotoLoggedMeal('user-1', 'user-1', payload());

    expect(txSteps()).toEqual(['BEGIN', 'COMMIT']);
    expect(result.mode).toBe('grouped');
    expect(result.food_entry_meal_id).toBe(
      '33333333-3333-4333-8333-333333333333'
    );
    expect(result.food_entry_ids).toHaveLength(2);
    expect(result.created_food_ids).toEqual([
      '55555555-5555-4555-8555-555555555555',
    ]);
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('does all the work on ONE client', async () => {
    await createPhotoLoggedMeal('user-1', 'user-1', payload());
    // The whole point of the extraction: foods created here must be visible to
    // the entry insert in the same transaction.
    expect(getClientMock).toHaveBeenCalledTimes(1);
    const client = await getClientMock.mock.results[0].value;
    expect(createFoodWithClientMock.mock.calls[0][0]).toBe(client);
    expect(createFoodEntryMealWithClientMock.mock.calls[0][0]).toBe(client);
    expect(bulkCreateFoodEntriesWithClientMock.mock.calls[0][0]).toBe(client);
  });

  it('forces the food-library hygiene flags regardless of the payload', async () => {
    await createPhotoLoggedMeal('user-1', 'user-1', payload());
    const created = createFoodWithClientMock.mock.calls[0][1];
    expect(created.is_quick_food).toBe(true);
    expect(created.provider_type).toBe('food_photo_estimate');
    expect(created.shared_with_public).toBe(false);
    expect(created.user_id).toBe('user-1');
  });

  it('stores new-food nutrition unscaled, on the per-100g basis it arrived in', async () => {
    await createPhotoLoggedMeal('user-1', 'user-1', payload());
    const created = createFoodWithClientMock.mock.calls[0][1];
    // 104.7 kcal per 100 g; the 85 g actually eaten lives on the entry.
    expect(created.calories).toBe(104.7);
    expect(created.serving_size).toBe(100);
    expect(created.serving_unit).toBe('g');
    const entries = bulkCreateFoodEntriesWithClientMock.mock.calls[0][1];
    expect(entries[1].quantity).toBe(85);
    expect(entries[1].unit).toBe('g');
  });

  it('snapshots the matched food nutrition onto its entry', async () => {
    await createPhotoLoggedMeal('user-1', 'user-1', payload());
    const entries = bulkCreateFoodEntriesWithClientMock.mock.calls[0][1];
    expect(entries[0].food_id).toBe(EXISTING_FOOD_ID);
    expect(entries[0].variant_id).toBe(EXISTING_VARIANT_ID);
    expect(entries[0].food_name).toBe('Chicken Thigh');
    expect(entries[0].calories).toBe(199);
    expect(entries[0].quantity).toBe(145);
  });

  it('attaches every entry to the parent meal in grouped mode', async () => {
    await createPhotoLoggedMeal('user-1', 'user-1', payload());
    const entries = bulkCreateFoodEntriesWithClientMock.mock.calls[0][1];
    for (const entry of entries) {
      expect(entry.food_entry_meal_id).toBe(
        '33333333-3333-4333-8333-333333333333'
      );
      expect(entry.meal_type_id).toBe(MEAL_TYPE_ID);
      expect(entry.entry_date).toBe('2026-08-27');
    }
  });

  it('creates the ad-hoc parent as a plain single serving with no template', async () => {
    await createPhotoLoggedMeal('user-1', 'user-1', payload());
    const parent = createFoodEntryMealWithClientMock.mock.calls[0][1];
    expect(parent.meal_template_id).toBeNull();
    // Ad-hoc parents do not scale their components, so the amounts must live
    // on each component and the parent must stay at 1 serving.
    expect(parent.quantity).toBe(1);
    expect(parent.unit).toBe('serving');
    expect(parent.legacy_serving_unit_math).toBe(false);
  });

  it('creates no parent meal in combined mode', async () => {
    const result = await createPhotoLoggedMeal(
      'user-1',
      'user-1',
      payload({
        mode: 'combined',
        items: [{ source: 'new', food: NEW_FOOD, quantity: 410, unit: 'g' }],
      })
    );
    expect(createFoodEntryMealWithClientMock).not.toHaveBeenCalled();
    expect(result.food_entry_meal_id).toBeNull();
    const entries = bulkCreateFoodEntriesWithClientMock.mock.calls[0][1];
    expect(entries[0].food_entry_meal_id).toBeNull();
  });

  it('rolls back and creates NOTHING when the entry insert fails', async () => {
    bulkCreateFoodEntriesWithClientMock.mockRejectedValue(
      new Error('connection terminated')
    );
    await expect(
      createPhotoLoggedMeal('user-1', 'user-1', payload())
    ).rejects.toThrow('connection terminated');

    expect(txSteps()).toEqual(['BEGIN', 'ROLLBACK']);
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('rolls back when a food creation fails part-way through', async () => {
    createFoodWithClientMock.mockRejectedValue(
      new Error('constraint violation')
    );
    await expect(
      createPhotoLoggedMeal('user-1', 'user-1', payload())
    ).rejects.toThrow('constraint violation');
    expect(txSteps()).toEqual(['BEGIN', 'ROLLBACK']);
  });

  it('validates every reused food BEFORE creating anything', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('FROM food_variants')) return { rows: [] };
      return { rows: [] };
    });
    await expect(
      createPhotoLoggedMeal('user-1', 'user-1', payload())
    ).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' });

    // No food and no parent may have been created before the failure.
    expect(createFoodWithClientMock).not.toHaveBeenCalled();
    expect(createFoodEntryMealWithClientMock).not.toHaveBeenCalled();
    expect(txSteps()).toEqual(['BEGIN', 'ROLLBACK']);
  });

  it('rejects a variant that belongs to a different food', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('FROM food_variants')) {
        return {
          rows: [
            {
              ...existingVariantRow,
              food_id: '99999999-9999-4999-8999-999999999999',
            },
          ],
        };
      }
      return { rows: [] };
    });
    await expect(
      createPhotoLoggedMeal('user-1', 'user-1', payload())
    ).rejects.toMatchObject({ code: 'FOOD_NOT_FOUND' });
  });

  it('loads all reused variants in a single query', async () => {
    await createPhotoLoggedMeal('user-1', 'user-1', payload());
    const variantQueries = queryMock.mock.calls.filter((call) =>
      String(call[0]).includes('FROM food_variants')
    );
    expect(variantQueries).toHaveLength(1);
    expect(variantQueries[0][1]).toEqual([[EXISTING_VARIANT_ID]]);
  });

  it('skips the variant query entirely when nothing is reused', async () => {
    await createPhotoLoggedMeal(
      'user-1',
      'user-1',
      payload({
        items: [{ source: 'new', food: NEW_FOOD, quantity: 85, unit: 'g' }],
      })
    );
    const variantQueries = queryMock.mock.calls.filter((call) =>
      String(call[0]).includes('FROM food_variants')
    );
    expect(variantQueries).toHaveLength(0);
  });

  it('surfaces an unknown meal type as INVALID_MEAL_TYPE', async () => {
    resolveMealTypeIdWithClientMock.mockRejectedValue(
      new Error('Invalid meal type: brunchh')
    );
    await expect(
      createPhotoLoggedMeal('user-1', 'user-1', payload())
    ).rejects.toBeInstanceOf(PhotoLogError);
    expect(txSteps()).toEqual(['BEGIN', 'ROLLBACK']);
  });

  it('opens the client with the target user and the acting user for RLS', async () => {
    await createPhotoLoggedMeal('target-user', 'acting-user', payload());
    expect(getClientMock).toHaveBeenCalledWith('target-user', 'acting-user');
    const entries = bulkCreateFoodEntriesWithClientMock.mock.calls[0][1];
    expect(entries[0].user_id).toBe('target-user');
    expect(entries[0].created_by_user_id).toBe('acting-user');
  });

  it('releases the client even when ROLLBACK itself fails', async () => {
    bulkCreateFoodEntriesWithClientMock.mockRejectedValue(new Error('boom'));
    queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).trim().toUpperCase() === 'ROLLBACK') {
        throw new Error('connection already closed');
      }
      if (String(sql).includes('FROM food_variants')) {
        return { rows: [existingVariantRow] };
      }
      return { rows: [] };
    });
    // The original failure must survive, not be masked by the rollback error.
    await expect(
      createPhotoLoggedMeal('user-1', 'user-1', payload())
    ).rejects.toThrow('boom');
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });
});
