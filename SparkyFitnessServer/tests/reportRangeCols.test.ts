import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FOOD_VARIANT_NUTRIENT_FIELDS } from '@workspace/shared';
import {
  createMockDbClient,
  type MockDbClient,
} from './helpers/mockDbClient.js';
import { v4 as uuidv4 } from 'uuid';
import { getClient } from '../db/poolManager.js';
import { getDailyNutritionTotalsRange } from '../models/reportRepository.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

// The range query's select list used to be a hand-written second copy of the shared nutrient
// list. Nothing enforced that the two stayed in step, and the failure mode is silent: a field
// added to FOOD_VARIANT_NUTRIENT_FIELDS but not to the copy just stops appearing in trends
// and in the chatbot's nutrition rows, with no type error and no failing query.
describe('getDailyNutritionTotalsRange select list', () => {
  let mockClient: MockDbClient;
  const userId = uuidv4();

  beforeEach(() => {
    mockClient = createMockDbClient([{}]);
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => vi.clearAllMocks());

  const sqlOf = async () => {
    await getDailyNutritionTotalsRange(userId, '2026-07-01', '2026-07-21');
    return String(mockClient.query.mock.calls[0][0]);
  };

  it('selects every shared nutrient field, on both the food and supplement arms', async () => {
    const sql = await sqlOf();
    for (const field of FOOD_VARIANT_NUTRIENT_FIELDS) {
      expect(sql, `food arm missing ${field}`).toContain(`SUM(fe.${field} *`);
      expect(sql, `supplement arm missing ${field}`).toContain(
        `nutrients_snapshot->>'${field}'`
      );
    }
  });

  it('emits one output column per shared nutrient field and no others', async () => {
    const sql = await sqlOf();
    const aliases = [...sql.matchAll(/\bas (\w+),?$/gim)].map((m) => m[1]);
    expect(aliases).toHaveLength(FOOD_VARIANT_NUTRIENT_FIELDS.length);
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  // Two fields are published under a different name than their column, and the consumers read
  // the alias: foodTools maps row.fiber and row.sugar. Renaming a column without carrying the
  // alias would hand those consumers undefined, which they coerce to 0.
  it('publishes dietary_fiber as fiber and sugars as sugar', async () => {
    const sql = await sqlOf();
    expect(sql).toMatch(/\bas fiber,?$/m);
    expect(sql).toMatch(/\bas sugar,?$/m);
    expect(sql).not.toMatch(/\bas dietary_fiber,?$/m);
    expect(sql).not.toMatch(/\bas sugars,?$/m);
  });
});
