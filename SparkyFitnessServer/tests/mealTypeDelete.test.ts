import {
  vi,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
} from 'vitest';
import mealTypeRepository, {
  MEAL_TYPE_IN_USE_MESSAGE,
  MEAL_TYPE_INVALID_TARGET_MESSAGE,
  MEAL_TYPE_SYSTEM_MESSAGE,
} from '../models/mealType.js';
import { v4 as uuidv4 } from 'uuid';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

// One recorded client.query(...) call: the SQL text and its bound params.
type QueryCall = [string, unknown[]?];

interface MockClient {
  query: Mock;
  release: Mock;
}

describe('mealTypeRepository.deleteMealType', () => {
  let mockClient: MockClient;
  const mealTypeId = uuidv4();
  const targetMealTypeId = uuidv4();
  const userId = uuidv4();

  // Responds like Postgres for the statements deleteMealType issues. `ownerId`
  // is what `SELECT user_id FROM meal_types` reports: the user for a custom
  // type, null for a system default.
  const installQueryMock = (
    options: {
      ownerId?: string | null;
      targetExists?: boolean;
      deleteRowCount?: number;
      failFinalDeleteWith?: { code: string };
    } = {}
  ) => {
    const {
      ownerId = userId,
      targetExists = true,
      deleteRowCount = 1,
      failFinalDeleteWith = null,
    } = options;

    mockClient.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return Promise.resolve();
      }
      if (sql.includes('SELECT user_id FROM meal_types')) {
        return Promise.resolve({ rows: [{ user_id: ownerId }] });
      }
      if (sql.includes('SELECT id FROM meal_types')) {
        return Promise.resolve({ rows: targetExists ? [{ id: sql }] : [] });
      }
      if (sql.includes('DELETE FROM meal_types')) {
        if (failFinalDeleteWith) return Promise.reject(failFinalDeleteWith);
        return Promise.resolve({
          rows: deleteRowCount ? [{ id: mealTypeId }] : [],
          rowCount: deleteRowCount,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  };

  const queryTexts = (): string[] =>
    (mockClient.query.mock.calls as QueryCall[]).map((call) => call[0]);

  const indexOfMatch = (needle: string): number =>
    queryTexts().findIndex((sql) => sql.includes(needle));

  const callMatching = (needle: string): QueryCall | undefined =>
    (mockClient.query.mock.calls as QueryCall[]).find((call) =>
      call[0].includes(needle)
    );

  beforeEach(() => {
    mockClient = { query: vi.fn(), release: vi.fn() };
    vi.mocked(getClient).mockResolvedValue(
      mockClient as unknown as Awaited<ReturnType<typeof getClient>>
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('strict mode (default)', () => {
    it('deletes without touching referencing tables', async () => {
      installQueryMock();

      const result = await mealTypeRepository.deleteMealType(
        mealTypeId,
        userId
      );

      expect(result).toEqual({ deleted: true, mode: 'strict' });
      expect(indexOfMatch('UPDATE food_entries')).toBe(-1);
      expect(indexOfMatch('DELETE FROM food_entries')).toBe(-1);
      expect(indexOfMatch('DELETE FROM meal_types')).toBeGreaterThan(-1);
    });

    it('reports a blocked delete as in-use for RESTRICT violations (23001)', async () => {
      installQueryMock({ failFinalDeleteWith: { code: '23001' } });

      await expect(
        mealTypeRepository.deleteMealType(mealTypeId, userId)
      ).rejects.toThrow(MEAL_TYPE_IN_USE_MESSAGE);
    });

    it('reports a blocked delete as in-use for FK violations (23503)', async () => {
      installQueryMock({ failFinalDeleteWith: { code: '23503' } });

      await expect(
        mealTypeRepository.deleteMealType(mealTypeId, userId)
      ).rejects.toThrow(MEAL_TYPE_IN_USE_MESSAGE);
    });

    it('returns not-deleted when the type belongs to another user', async () => {
      installQueryMock({ ownerId: uuidv4() });

      const result = await mealTypeRepository.deleteMealType(
        mealTypeId,
        userId
      );

      expect(result.deleted).toBe(false);
      expect(indexOfMatch('DELETE FROM meal_types')).toBe(-1);
    });

    it('refuses to delete system default meal types', async () => {
      installQueryMock({ ownerId: null });

      await expect(
        mealTypeRepository.deleteMealType(mealTypeId, userId)
      ).rejects.toThrow(MEAL_TYPE_SYSTEM_MESSAGE);
      expect(indexOfMatch('DELETE FROM meal_types')).toBe(-1);
    });
  });

  describe('reassign mode', () => {
    it('moves every referencing table to the target, then deletes, in one transaction', async () => {
      installQueryMock();

      const result = await mealTypeRepository.deleteMealType(
        mealTypeId,
        userId,
        { mode: 'reassign', targetMealTypeId }
      );

      expect(result).toEqual({
        deleted: true,
        mode: 'reassign',
        reassignedTo: targetMealTypeId,
      });

      for (const table of [
        'UPDATE food_entries',
        'UPDATE food_entry_meals',
        'UPDATE meal_plans',
        'UPDATE meal_plan_template_assignments',
      ]) {
        const call = callMatching(table);
        expect(call, table).toBeDefined();
        expect(call?.[1]?.[0]).toBe(targetMealTypeId);
      }

      const texts = queryTexts();
      expect(texts.indexOf('BEGIN')).toBeLessThan(
        indexOfMatch('UPDATE food_entries')
      );
      expect(
        indexOfMatch('UPDATE meal_plan_template_assignments')
      ).toBeLessThan(indexOfMatch('DELETE FROM meal_types'));
      expect(texts.indexOf('COMMIT')).toBeGreaterThan(
        indexOfMatch('DELETE FROM meal_types')
      );
      expect(texts).not.toContain('ROLLBACK');
    });

    it('scopes template assignments through the parent template', async () => {
      installQueryMock();

      await mealTypeRepository.deleteMealType(mealTypeId, userId, {
        mode: 'reassign',
        targetMealTypeId,
      });

      const call = callMatching('UPDATE meal_plan_template_assignments');
      // The table has no user_id column; RLS derives ownership via the parent.
      expect(call![0]).toContain(
        'SELECT id FROM meal_plan_templates WHERE user_id'
      );
    });

    it('rejects a target that is not visible to the user, without mutating', async () => {
      installQueryMock({ targetExists: false });

      await expect(
        mealTypeRepository.deleteMealType(mealTypeId, userId, {
          mode: 'reassign',
          targetMealTypeId,
        })
      ).rejects.toThrow(MEAL_TYPE_INVALID_TARGET_MESSAGE);

      expect(indexOfMatch('UPDATE food_entries')).toBe(-1);
      expect(indexOfMatch('DELETE FROM meal_types')).toBe(-1);
      expect(queryTexts()).toContain('ROLLBACK');
    });

    it('rejects reassigning a meal type onto itself', async () => {
      installQueryMock();

      await expect(
        mealTypeRepository.deleteMealType(mealTypeId, userId, {
          mode: 'reassign',
          targetMealTypeId: mealTypeId,
        })
      ).rejects.toThrow(MEAL_TYPE_INVALID_TARGET_MESSAGE);
      expect(indexOfMatch('UPDATE food_entries')).toBe(-1);
    });
  });

  describe('force mode', () => {
    it('detaches stray container children before deleting the containers', async () => {
      installQueryMock();

      const result = await mealTypeRepository.deleteMealType(
        mealTypeId,
        userId,
        { mode: 'force' }
      );

      expect(result).toEqual({ deleted: true, mode: 'force' });

      // food_entries.food_entry_meal_id cascades from food_entry_meals, so a
      // child belonging to a different meal type must be detached first or the
      // cascade destroys data outside this meal type.
      const detachIndex = indexOfMatch('SET food_entry_meal_id = NULL');
      const containerDeleteIndex = indexOfMatch('DELETE FROM food_entry_meals');
      expect(detachIndex).toBeGreaterThan(-1);
      expect(detachIndex).toBeLessThan(containerDeleteIndex);

      const detachCall = callMatching('SET food_entry_meal_id = NULL');
      expect(detachCall![0]).toContain('meal_type_id <> $1');
    });

    it('deletes every referencing table then the meal type, in one transaction', async () => {
      installQueryMock();

      await mealTypeRepository.deleteMealType(mealTypeId, userId, {
        mode: 'force',
      });

      for (const statement of [
        'DELETE FROM food_entry_meals',
        'DELETE FROM food_entries',
        'DELETE FROM meal_plans',
        'DELETE FROM meal_plan_template_assignments',
      ]) {
        expect(indexOfMatch(statement), statement).toBeGreaterThan(-1);
        expect(indexOfMatch(statement)).toBeLessThan(
          indexOfMatch('DELETE FROM meal_types')
        );
      }

      const texts = queryTexts();
      expect(texts.indexOf('COMMIT')).toBeGreaterThan(
        indexOfMatch('DELETE FROM meal_types')
      );
      expect(texts).not.toContain('ROLLBACK');
    });
  });
});
