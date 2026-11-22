import { putCacheRows } from '../../src/offline/cacheStore';
import { CACHE_COLLECTIONS } from '../../src/offline/collections';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { previewFromQueuedMeal } from '../../src/offline/foodEntryPreview';
import type { OfflineDb, OutboxRow } from '../../src/offline/types';
import { createTestDb } from '../helpers/offlineTestDb';

const meal = {
  id: 'meal-1',
  name: 'Porridge',
  serving_size: 1,
  serving_unit: 'serving',
  total_servings: 2,
  foods: [
    {
      id: 'i1',
      food_id: 'f1',
      variant_id: 'v1',
      quantity: 100,
      unit: 'g',
      food_name: 'Oats',
      brand: null,
      serving_size: 100,
      serving_unit: 'g',
      calories: 400,
      protein: 10,
      carbs: 60,
      fat: 8,
    },
  ],
};

const row = (payload: object): OutboxRow =>
  ({
    id: 'r1',
    entityId: 'key-1',
    kind: 'food_entry_meal.create',
    payload,
  }) as unknown as OutboxRow;

const base = {
  meal_template_id: 'meal-1',
  meal_type_id: 'mt',
  entry_date: '2026-11-21',
  name: 'Porridge',
  quantity: 1,
  unit: 'serving',
};

describe('the Diary preview of a logged meal that is waiting', () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    db = await createTestDb();
    __setOfflineDbForTests(db);
    await putCacheRows(db, 's1', CACHE_COLLECTIONS.meal, [
      { key: 'meal-1', name: 'Porridge', payload: meal },
    ]);
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  it('uses the saved meal when nothing was customised', async () => {
    const preview = await previewFromQueuedMeal(db, 's1', row(base));
    expect(preview?.calories).toBe(200);
  });

  it('uses the customised ingredients, which carry their own nutrition', async () => {
    const preview = await previewFromQueuedMeal(
      db,
      's1',
      row({
        ...base,
        foods: [
          {
            food_id: 'f1',
            variant_id: 'v1',
            quantity: 100,
            unit: 'g',
            serving_size: 100,
            food_name: 'Oats',
            calories: 400,
            protein: 10,
          },
          {
            food_id: 'f2',
            variant_id: 'v2',
            quantity: 50,
            unit: 'g',
            serving_size: 50,
            food_name: 'Honey',
            calories: 160,
            protein: 0,
          },
        ],
      })
    );
    // (400 + 160) kcal for the whole dish, over its 2 servings.
    expect(preview?.calories).toBe(280);
  });

  it('leaves out an ingredient without nutrition, since the server works it out', async () => {
    const preview = await previewFromQueuedMeal(
      db,
      's1',
      row({
        ...base,
        foods: [{ food_id: 'f1', variant_id: 'v1', quantity: 1, unit: 'g' }],
      })
    );
    expect(preview).toBeNull();
  });
});
