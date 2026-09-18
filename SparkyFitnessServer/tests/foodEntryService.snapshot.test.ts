import { beforeEach, describe, expect, it, vi } from 'vitest';
import foodEntryService from '../services/foodEntryService.js';
import foodRepository from '../models/foodRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../models/foodRepository.js', () => ({
  default: {
    getFoodEntryOwnerId: vi.fn(),
    getFoodEntryById: vi.fn(),
    getFoodById: vi.fn(),
    getFoodVariantById: vi.fn(),
    updateFoodEntry: vi.fn(),
  },
}));
vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const ENTRY_ID = '33333333-3333-4333-8333-333333333333';
const FOOD_ID = '11111111-1111-4111-8111-111111111111';
const OLD_VARIANT_ID = '22222222-2222-4222-8222-222222222222';
const NEW_VARIANT_ID = '44444444-4444-4444-8444-444444444444';

const historicalEntry = {
  id: ENTRY_ID,
  food_id: FOOD_ID,
  variant_id: OLD_VARIANT_ID,
  meal_type_id: '66666666-6666-4666-8666-666666666666',
  quantity: 75,
  unit: 'g',
  entry_date: '2026-09-15',
  entry_time: null,
  notes: null,
  food_name: 'Lentils, dry',
  brand_name: null,
  serving_size: 100,
  serving_unit: 'g',
  calories: 351,
  protein: 23.6,
  carbs: 62.2,
  fat: 1.9,
};

function mockUpdateSetup() {
  vi.mocked(foodRepository.getFoodEntryOwnerId).mockResolvedValue('user-1');
  vi.mocked(foodRepository.getFoodEntryById).mockResolvedValue(historicalEntry);
  vi.mocked(foodRepository.getFoodById).mockResolvedValue({
    id: FOOD_ID,
    name: 'Changed catalog food',
    brand: 'New brand',
  });
  vi.mocked(foodRepository.updateFoodEntry).mockResolvedValue({
    ...historicalEntry,
    quantity: 50,
  });
  vi.mocked(getClient).mockRejectedValue(new Error('no linked water entry'));
}

describe('foodEntryService.updateFoodEntry snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSetup();
  });

  it('preserves historical reference nutrition for an MCP quantity-only update', async () => {
    vi.mocked(foodRepository.getFoodVariantById).mockResolvedValue({
      id: OLD_VARIANT_ID,
      serving_size: 100,
      serving_unit: 'g',
      calories: 999,
      protein: 99,
      carbs: 99,
      fat: 99,
    });

    await foodEntryService.updateFoodEntry(
      'user-1',
      'user-1',
      ENTRY_ID,
      { quantity: 50, unit: 'g' },
      { preserveSnapshot: true }
    );

    const snapshot = vi.mocked(foodRepository.updateFoodEntry).mock
      .calls[0]?.[4];
    expect(snapshot).toMatchObject({
      food_name: 'Lentils, dry',
      serving_size: 100,
      serving_unit: 'g',
      calories: 351,
      protein: 23.6,
    });
  });

  it('refreshes reference nutrition for a native quantity-only update', async () => {
    vi.mocked(foodRepository.getFoodVariantById).mockResolvedValue({
      id: OLD_VARIANT_ID,
      serving_size: 100,
      serving_unit: 'g',
      calories: 999,
      protein: 99,
      carbs: 99,
      fat: 99,
    });

    await foodEntryService.updateFoodEntry('user-1', 'user-1', ENTRY_ID, {
      quantity: 50,
      unit: 'g',
    });

    const snapshot = vi.mocked(foodRepository.updateFoodEntry).mock
      .calls[0]?.[4];
    expect(snapshot).toMatchObject({
      food_name: 'Changed catalog food',
      calories: 999,
      protein: 99,
    });
  });

  it('uses the selected variant nutrition when the variant changes', async () => {
    vi.mocked(foodRepository.getFoodVariantById).mockResolvedValue({
      id: NEW_VARIANT_ID,
      serving_size: 30,
      serving_unit: 'g',
      calories: 120,
      protein: 5,
      carbs: 20,
      fat: 2,
    });

    await foodEntryService.updateFoodEntry('user-1', 'user-1', ENTRY_ID, {
      variant_id: NEW_VARIANT_ID,
      quantity: 30,
      unit: 'g',
    });

    const snapshot = vi.mocked(foodRepository.updateFoodEntry).mock
      .calls[0]?.[4];
    expect(snapshot).toMatchObject({
      food_name: 'Changed catalog food',
      serving_size: 30,
      serving_unit: 'g',
      calories: 120,
      protein: 5,
    });
  });
});
