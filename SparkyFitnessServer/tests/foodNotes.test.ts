import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import foodRepository from '../models/foodRepository.js';
import mealRepository from '../models/mealRepository.js';
import foodEntryMealRepository from '../models/foodEntryMealRepository.js';
import { getClient } from '../db/poolManager.js';
import { NOTES_MAX_LENGTH, sanitizeNotes } from '@workspace/shared';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));

/**
 * `notes` is user-authored freeform markdown on foods, meals, and diary
 * entries. It differs from every other column in these tables in two ways that
 * are easy to regress:
 *
 *   1. It must be clearable. COALESCE-based updates silently ignore an
 *      explicit null, so each writer uses a key-presence flag instead.
 *   2. It must never be written by a machine. The food -> past-entries
 *      snapshot resync, meal-plan template application, and provider re-sync
 *      all rewrite an entry's nutrition; none of them may touch its note.
 */
/** The subset of a pg client these repositories touch. */
interface MockClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

describe('notes on foods, meals, and diary entries', () => {
  let mockClient: MockClient;

  /** SQL text of the call whose statement contains `fragment`. */
  const sqlFor = (fragment: string): string => {
    const call = mockClient.query.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes(fragment)
    );
    if (!call) throw new Error(`No query matched ${fragment}`);
    return call[0] as string;
  };

  /** Bound parameters of the call whose statement contains `fragment`. */
  const paramsFor = (fragment: string): unknown[] => {
    const call = mockClient.query.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes(fragment)
    );
    if (!call) throw new Error(`No query matched ${fragment}`);
    return (call[1] ?? []) as unknown[];
  };

  beforeEach(() => {
    mockClient = { query: vi.fn(), release: vi.fn() };
    mockClient.query.mockResolvedValue({ rows: [{ id: uuidv4() }] });
    // @ts-expect-error mocked module
    getClient.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('sanitizeNotes', () => {
    it('distinguishes an omitted key from an explicit clear', () => {
      // undefined must survive as undefined so writers can tell "leave alone"
      // from "set to null"; everything empty collapses to null.
      expect(sanitizeNotes(undefined)).toBeUndefined();
      expect(sanitizeNotes(null)).toBeNull();
      expect(sanitizeNotes('')).toBeNull();
      expect(sanitizeNotes('   \n  ')).toBeNull();
    });

    it('trims and caps at NOTES_MAX_LENGTH', () => {
      expect(sanitizeNotes('  white rice, no beans  ')).toBe(
        'white rice, no beans'
      );
      const long = 'x'.repeat(NOTES_MAX_LENGTH + 500);
      expect(sanitizeNotes(long)).toHaveLength(NOTES_MAX_LENGTH);
    });
  });

  describe('foods', () => {
    it('stores a note on create', async () => {
      await foodRepository.createFood({
        name: 'Chipotle Bowl',
        user_id: uuidv4(),
        notes: '  **White rice**, double chicken, no beans  ',
      });

      const insert = sqlFor('INSERT INTO foods');
      expect(insert).toContain('notes');
      expect(paramsFor('INSERT INTO foods')).toContain(
        '**White rice**, double chicken, no beans'
      );
    });

    it('leaves the note untouched when the key is omitted', async () => {
      const foodId = uuidv4();
      await foodRepository.updateFood(foodId, uuidv4(), { name: 'Renamed' });

      const params = paramsFor('UPDATE foods SET');
      // The CASE flag is false, so the column keeps its stored value however
      // the (unused) value parameter is bound.
      expect(params).toContain(false);
    });

    it('clears the note when it is explicitly set to null', async () => {
      const foodId = uuidv4();
      await foodRepository.updateFood(foodId, uuidv4(), { notes: null });

      const sql = sqlFor('UPDATE foods SET');
      // A COALESCE here would silently ignore the null and strand the note.
      expect(sql).toMatch(/notes = CASE WHEN \$\d+::boolean THEN/);
      expect(paramsFor('UPDATE foods SET')).toContain(true);
    });
  });

  describe('meals', () => {
    it('stores a note on create', async () => {
      await mealRepository.createMeal({
        user_id: uuidv4(),
        name: 'Sunday Chili',
        notes: '# Recipe\n\n1. Brown the beef',
      });

      expect(sqlFor('INSERT INTO meals')).toContain('notes');
      expect(paramsFor('INSERT INTO meals')).toContain(
        '# Recipe\n\n1. Brown the beef'
      );
    });

    it('clears the note when it is explicitly set to null', async () => {
      await mealRepository.updateMeal(uuidv4(), uuidv4(), { notes: null });

      expect(sqlFor('UPDATE meals SET')).toMatch(
        /notes = CASE WHEN \$\d+::boolean THEN/
      );
      expect(paramsFor('UPDATE meals SET')).toContain(true);
    });
  });

  describe('food_entry_meals', () => {
    it('clears the note when it is explicitly set to null', async () => {
      await foodEntryMealRepository.updateFoodEntryMeal(
        uuidv4(),
        { notes: null },
        uuidv4()
      );

      // description above it uses COALESCE and cannot be cleared; notes must
      // not inherit that limitation.
      expect(sqlFor('UPDATE food_entry_meals SET')).toMatch(
        /notes = CASE WHEN \$\d+::boolean THEN/
      );
    });
  });

  describe('machine writers never touch a note', () => {
    it('the food -> past-entries snapshot resync does not write notes', async () => {
      await foodRepository.updateFoodEntriesSnapshot(
        uuidv4(),
        uuidv4(),
        uuidv4(),
        {
          food_name: 'Chicken Breast',
          brand_name: 'Acme',
          serving_size: 100,
          serving_unit: 'g',
          calories: 165,
        },
        false
      );

      // Editing a food's nutrition rewrites every past entry's snapshot. The
      // user's note on those entries is not part of that snapshot.
      expect(sqlFor('UPDATE food_entries')).not.toContain('notes');
    });

    it('a provider re-sync does not overwrite an existing note', async () => {
      await foodRepository.createFoodEntry(
        {
          user_id: uuidv4(),
          food_id: uuidv4(),
          variant_id: uuidv4(),
          meal_type_id: uuidv4(),
          entry_date: '2026-08-30',
          quantity: 1,
          source: 'health_connect',
          source_id: 'abc123',
          food_name: 'Oats',
        },
        uuidv4()
      );

      const insert = sqlFor('INSERT INTO food_entries');
      const conflictClause = insert.slice(insert.indexOf('ON CONFLICT'));
      // Re-ingesting the same provider record refreshes nutrition, not prose.
      expect(conflictClause).not.toContain('notes = EXCLUDED.notes');
    });
  });

  describe('updateFoodEntryMeal component safety', () => {
    it('leaves components alone when the update supplies no foods', async () => {
      // A note-only edit must not empty the logged meal: the rebuild deletes
      // every component first, so an absent `foods` used to wipe them.
      const foodEntryMealRepository = (
        await import('../models/foodEntryMealRepository.js')
      ).default;
      const foodRepository = (await import('../models/foodRepository.js'))
        .default;
      vi.spyOn(
        foodEntryMealRepository,
        'updateFoodEntryMeal'
      ).mockResolvedValue({
        id: 'fem-1',
        meal_type_id: 'mt-1',
        legacy_serving_unit_math: false,
      });
      const deleteSpy = vi.spyOn(
        foodRepository,
        'deleteFoodEntryComponentsByFoodEntryMealId'
      );

      const foodEntryService = (await import('../services/foodEntryService.js'))
        .default;
      await foodEntryService.updateFoodEntryMeal('user-1', 'user-1', 'fem-1', {
        notes: 'just the note',
      });

      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('refuses a component-affecting update that omits foods', async () => {
      // Components carry the meal's date, meal type and scaled nutrition, so
      // silently keeping the old ones would desync them from the parent.
      const foodEntryMealRepository = (
        await import('../models/foodEntryMealRepository.js')
      ).default;
      vi.spyOn(
        foodEntryMealRepository,
        'updateFoodEntryMeal'
      ).mockResolvedValue({
        id: 'fem-1',
        meal_type_id: 'mt-1',
        legacy_serving_unit_math: false,
      });

      const foodEntryService = (await import('../services/foodEntryService.js'))
        .default;

      await expect(
        foodEntryService.updateFoodEntryMeal('user-1', 'user-1', 'fem-1', {
          entry_date: '2026-02-02',
        })
      ).rejects.toThrow(/'foods' is required/);
    });
  });
});
