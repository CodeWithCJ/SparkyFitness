import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { updateFoodVariantNutrition } from '../models/food.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));

const ADDED_SUGARS_VALUE_PARAM = 24;
const ADDED_SUGARS_PRESENT_PARAM = 25;

describe('updateFoodVariantNutrition added_sugars', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;
  const base = { serving_size: 100, serving_unit: 'g', calories: 50 };

  const run = async (nutrition: Record<string, unknown>) => {
    await updateFoodVariantNutrition('variant-1', 'user-1', {
      ...base,
      ...nutrition,
    });
    const [sql, params] = mockClient.query.mock.calls[0];
    return { sql, params };
  };

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
    // @ts-expect-error mocked in test
    getClient.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the stored value when the caller never sends the key', async () => {
    const { sql, params } = await run({});

    expect(params[ADDED_SUGARS_PRESENT_PARAM]).toBe(false);
    expect(sql).toContain(
      'CASE WHEN $26::boolean THEN $25::numeric ELSE added_sugars END'
    );
  });

  it('clears the stored value on an explicit null', async () => {
    const { params } = await run({ added_sugars: null });

    expect(params[ADDED_SUGARS_PRESENT_PARAM]).toBe(true);
    expect(params[ADDED_SUGARS_VALUE_PARAM]).toBeNull();
  });

  it('writes a sent value, zero included', async () => {
    const { params } = await run({ added_sugars: 0 });

    expect(params[ADDED_SUGARS_PRESENT_PARAM]).toBe(true);
    expect(params[ADDED_SUGARS_VALUE_PARAM]).toBe(0);
  });
});
