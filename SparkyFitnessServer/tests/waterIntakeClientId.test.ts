import { vi, beforeEach, describe, expect, it } from 'vitest';
import measurementService from '../services/measurementService.js';
import measurementRepository from '../models/measurementRepository.js';
import waterContainerRepository from '../models/waterContainerRepository.js';
import foodRepository from '../models/foodRepository.js';
import mealTypeRepository from '../models/mealType.js';
import hydrationTotalsService from '../services/hydrationTotalsService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { UpsertWaterIntakeBodySchema } from '../schemas/measurementSchemas.js';

vi.mock('../models/measurementRepository', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../models/measurementRepository.js')>();
  return {
    ...actual,
    default: {
      insertWaterIntakeLog: vi.fn(),
      findWaterIntakeLogByClientId: vi.fn(),
      recomputeWaterAggregateForUser: vi.fn(),
    },
  };
});
vi.mock('../models/waterContainerRepository');
vi.mock('../models/foodRepository');
vi.mock('../models/mealType');
vi.mock('../utils/timezoneLoader');
vi.mock('../services/hydrationTotalsService.js', () => ({
  default: { resolveWaterTotalsForDate: vi.fn() },
}));
vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));

const USER = 'user-1';
const DATE = '2026-10-17';
const CLIENT_ID = '33333333-3333-4333-8333-333333333333';
const TOTALS = { water_ml: 250, manual_ml: 250, ledger_ml: 250 };

const insert = vi.mocked(measurementRepository.insertWaterIntakeLog);
const find = vi.mocked(measurementRepository.findWaterIntakeLogByClientId);
const totals = vi.mocked(hydrationTotalsService.resolveWaterTotalsForDate);

describe('upsertWaterIntake client_id (offline replay)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insert.mockReset();
    insert.mockResolvedValue({} as never);
    find.mockResolvedValue(null);
    totals.mockResolvedValue(TOTALS as never);
    vi.mocked(waterContainerRepository.getWaterContainerById).mockResolvedValue(
      null as never
    );
  });

  it('logs the drink with the client id on a first request', async () => {
    const res = await measurementService.upsertWaterIntake(
      USER,
      USER,
      DATE,
      1,
      null,
      CLIENT_ID
    );

    expect(find).toHaveBeenCalledWith(USER, CLIENT_ID);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][11]).toBe(CLIENT_ID);
    expect(res).toEqual(TOTALS);
  });

  it('logs nothing and returns the totals when the id was already used', async () => {
    find.mockResolvedValue({ id: 'drink-1' } as never);

    const res = await measurementService.upsertWaterIntake(
      USER,
      USER,
      DATE,
      1,
      null,
      CLIENT_ID
    );

    expect(insert).not.toHaveBeenCalled();
    expect(
      measurementRepository.recomputeWaterAggregateForUser
    ).not.toHaveBeenCalled();
    expect(res).toEqual(TOTALS);
  });

  it('treats a lost race on the unique index as a duplicate, not an error', async () => {
    insert.mockRejectedValue(
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'idx_water_intake_entries_user_client_id',
      })
    );

    await expect(
      measurementService.upsertWaterIntake(USER, USER, DATE, 1, null, CLIENT_ID)
    ).resolves.toEqual(TOTALS);
  });

  it('still surfaces other insert failures', async () => {
    insert.mockRejectedValue(new Error('connection lost'));

    await expect(
      measurementService.upsertWaterIntake(USER, USER, DATE, 1, null, CLIENT_ID)
    ).rejects.toThrow('connection lost');
  });

  it('refuses a client id on anything but a single drink', async () => {
    await expect(
      measurementService.upsertWaterIntake(USER, USER, DATE, 2, null, CLIENT_ID)
    ).rejects.toThrow('single drink');
    await expect(
      measurementService.upsertWaterIntake(
        USER,
        USER,
        DATE,
        -1,
        null,
        CLIENT_ID
      )
    ).rejects.toThrow('single drink');
    expect(insert).not.toHaveBeenCalled();
  });

  it('does not look anything up for requests without a client id', async () => {
    await measurementService.upsertWaterIntake(USER, USER, DATE, 1, null);

    expect(find).not.toHaveBeenCalled();
    expect(insert.mock.calls[0][11]).toBeNull();
  });

  it('gives the linked food entry the same key so a duplicate stops there', async () => {
    vi.mocked(waterContainerRepository.getWaterContainerById).mockResolvedValue(
      {
        id: 10,
        name: 'Mug',
        volume: '0.000',
        servings_per_container: 1,
        hydration_factor: 1,
        linked_food_id: 'food-1',
        linked_variant_id: 'variant-1',
        linked_meal_type_id: 'meal-type-1',
      } as never
    );
    vi.mocked(loadUserTimezone).mockResolvedValue('UTC');
    vi.mocked(foodRepository.getFoodById).mockResolvedValue({
      id: 'food-1',
      name: 'Coffee',
      default_variant: { id: 'variant-1' },
    } as never);
    vi.mocked(foodRepository.getFoodVariantById).mockResolvedValue({
      id: 'variant-1',
      serving_size: 1,
      serving_unit: 'cup',
      water_ml: 200,
    } as never);
    vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([]);
    vi.mocked(foodRepository.createFoodEntry).mockResolvedValue({
      id: 'entry-1',
    } as never);

    await measurementService.upsertWaterIntake(
      USER,
      USER,
      DATE,
      1,
      10,
      CLIENT_ID
    );

    expect(foodRepository.createFoodEntry).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: CLIENT_ID }),
      USER
    );
    expect(insert.mock.calls[0][11]).toBe(CLIENT_ID);
  });
});

describe('UpsertWaterIntakeBodySchema client_id', () => {
  const base = { entry_date: DATE, container_id: 3 };

  it('accepts a uuid with a single drink', () => {
    const result = UpsertWaterIntakeBodySchema.safeParse({
      ...base,
      change_drinks: 1,
      client_id: CLIENT_ID,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a client id with any other drink count', () => {
    for (const change_drinks of [2, -1, 0]) {
      expect(
        UpsertWaterIntakeBodySchema.safeParse({
          ...base,
          change_drinks,
          client_id: CLIENT_ID,
        }).success
      ).toBe(false);
    }
  });

  it('rejects a client id that is not a uuid', () => {
    expect(
      UpsertWaterIntakeBodySchema.safeParse({
        ...base,
        change_drinks: 1,
        client_id: 'not-a-uuid',
      }).success
    ).toBe(false);
  });

  it('keeps accepting requests without one', () => {
    expect(
      UpsertWaterIntakeBodySchema.safeParse({ ...base, change_drinks: 3 })
        .success
    ).toBe(true);
  });
});
