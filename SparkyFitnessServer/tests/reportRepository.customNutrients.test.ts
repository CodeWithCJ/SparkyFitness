import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createMockDbClient,
  type MockDbClient,
} from './helpers/mockDbClient.js';
import { v4 as uuidv4 } from 'uuid';
import { getClient } from '../db/poolManager.js';
import {
  getNutritionData,
  getTabularFoodData,
  getMiniNutritionTrends,
} from '../models/reportRepository.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

describe('reportRepository — custom nutrient parameterization and SQL escaping', () => {
  let mockClient: MockDbClient;
  const userId = uuidv4();

  beforeEach(() => {
    mockClient = createMockDbClient([]);
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => vi.clearAllMocks());

  it('getTabularFoodData binds custom nutrient JSON keys as query parameters and escapes identifiers', async () => {
    const customNutrients = [
      { name: "St. John's Wort" },
      { name: 'Vitamin "Special" B' },
    ];

    await getTabularFoodData(
      userId,
      '2026-07-01',
      '2026-07-01',
      customNutrients
    );

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    const sql = String(mockClient.query.mock.calls[0][0]);
    const params = mockClient.query.mock.calls[0][1];

    // Check JSON extract uses parameter placeholders
    expect(sql).toContain('fe.custom_nutrients->>$4');
    expect(sql).toContain('fe.custom_nutrients->>$5');
    // Check parameters passed to query
    expect(params).toEqual([
      userId,
      '2026-07-01',
      '2026-07-01',
      "St. John's Wort",
      'Vitamin "Special" B',
    ]);
    // Check identifier escaping for double quotes
    expect(sql).toContain('AS "St. John\'s Wort"');
    expect(sql).toContain('AS "Vitamin ""Special"" B"');
    expect(sql).toContain('cfe."St. John\'s Wort"');
    expect(sql).toContain(
      'SUM(cfe_meal."St. John\'s Wort") AS "St. John\'s Wort"'
    );
  });

  it('getNutritionData binds custom nutrient JSON keys as query parameters and escapes identifiers', async () => {
    const customNutrients = [
      { name: "St. John's Wort" },
      { name: 'Vitamin "Special" B' },
    ];

    await getNutritionData(userId, '2026-07-01', '2026-07-01', customNutrients);

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    const sql = String(mockClient.query.mock.calls[0][0]);
    const params = mockClient.query.mock.calls[0][1];

    // Check JSON extract uses parameter placeholders
    expect(sql).toContain('fe.custom_nutrients->>$4');
    expect(sql).toContain('fe_meal.custom_nutrients->>$4');
    expect(sql).toContain("me.nutrients_snapshot->'custom_nutrients'->>$4");
    expect(sql).toContain('fe.custom_nutrients->>$5');
    expect(sql).toContain('fe_meal.custom_nutrients->>$5');
    expect(sql).toContain("me.nutrients_snapshot->'custom_nutrients'->>$5");
    // Check parameters passed to query
    expect(params).toEqual([
      userId,
      '2026-07-01',
      '2026-07-01',
      "St. John's Wort",
      'Vitamin "Special" B',
    ]);
    // Check identifier escaping
    expect(sql).toContain('SUM("St. John\'s Wort") AS "St. John\'s Wort"');
    expect(sql).toContain(
      'SUM("Vitamin ""Special"" B") AS "Vitamin ""Special"" B"'
    );
  });

  it('getMiniNutritionTrends binds custom nutrient JSON keys as query parameters and escapes identifiers', async () => {
    const customNutrients = [
      { name: "St. John's Wort" },
      { name: 'Vitamin "Special" B' },
    ];

    await getMiniNutritionTrends(
      userId,
      '2026-07-01',
      '2026-07-01',
      customNutrients
    );

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    const sql = String(mockClient.query.mock.calls[0][0]);
    const params = mockClient.query.mock.calls[0][1];

    // Check JSON extract uses parameter placeholders
    expect(sql).toContain('fe.custom_nutrients->>$4');
    expect(sql).toContain('fe_meal.custom_nutrients->>$4');
    expect(sql).toContain('fe.custom_nutrients->>$5');
    expect(sql).toContain('fe_meal.custom_nutrients->>$5');
    // Check parameters passed to query
    expect(params).toEqual([
      userId,
      '2026-07-01',
      '2026-07-01',
      "St. John's Wort",
      'Vitamin "Special" B',
    ]);
    // Check identifier escaping
    expect(sql).toContain('SUM("St. John\'s Wort") AS "St. John\'s Wort"');
    expect(sql).toContain(
      'SUM("Vitamin ""Special"" B") AS "Vitamin ""Special"" B"'
    );
  });
});
