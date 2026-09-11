import { vi, beforeEach, describe, expect, it } from 'vitest';
import hydrationTotalsService from '../services/hydrationTotalsService.js';
import measurementRepository from '../models/measurementRepository.js';
import foodRepository from '../models/foodMisc.js';
import preferenceRepository from '../models/preferenceRepository.js';

vi.mock('../models/measurementRepository.js');
vi.mock('../models/foodMisc.js');
vi.mock('../models/preferenceRepository.js');

describe('hydrationTotalsService.resolveWaterTotalsForDate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('excludes food-derived water when the user has not opted in (default)', async () => {
    // @ts-expect-error TS(2339): mock helper
    measurementRepository.getWaterIntakeByDate.mockResolvedValue({
      water_ml: '250',
      manual_ml: '250',
    });
    // @ts-expect-error TS(2339): mock helper
    preferenceRepository.getUserPreferences.mockResolvedValue({
      add_food_water_to_intake: false,
    });

    const result = await hydrationTotalsService.resolveWaterTotalsForDate(
      'user-1',
      'user-1',
      '2026-09-05'
    );

    expect(result).toEqual({
      water_ml: 250,
      manual_ml: 250,
      ledger_ml: 250,
      food_ml: 0,
    });
    expect(foodRepository.getFoodDerivedWaterMlForDate).not.toHaveBeenCalled();
  });

  it('folds food-derived water into the total when the preference is on', async () => {
    // @ts-expect-error TS(2339): mock helper
    measurementRepository.getWaterIntakeByDate.mockResolvedValue({
      water_ml: '250',
      manual_ml: '250',
    });
    // @ts-expect-error TS(2339): mock helper
    preferenceRepository.getUserPreferences.mockResolvedValue({
      add_food_water_to_intake: true,
    });
    // @ts-expect-error TS(2339): mock helper
    foodRepository.getFoodDerivedWaterMlForDate.mockResolvedValue(500);

    const result = await hydrationTotalsService.resolveWaterTotalsForDate(
      'user-1',
      'user-1',
      '2026-09-05'
    );

    expect(result).toEqual({
      water_ml: 750,
      manual_ml: 250,
      ledger_ml: 250,
      food_ml: 500,
    });
    expect(foodRepository.getFoodDerivedWaterMlForDate).toHaveBeenCalledWith(
      'user-1',
      '2026-09-05'
    );
  });

  it('degrades to 0 food_ml when the food-derived water query fails', async () => {
    // @ts-expect-error TS(2339): mock helper
    measurementRepository.getWaterIntakeByDate.mockResolvedValue({
      water_ml: '250',
      manual_ml: '250',
    });
    // @ts-expect-error TS(2339): mock helper
    preferenceRepository.getUserPreferences.mockResolvedValue({
      add_food_water_to_intake: true,
    });
    // @ts-expect-error TS(2339): mock helper
    foodRepository.getFoodDerivedWaterMlForDate.mockRejectedValue(
      new Error('DB error')
    );

    const result = await hydrationTotalsService.resolveWaterTotalsForDate(
      'user-1',
      'user-1',
      '2026-09-05'
    );

    expect(result.food_ml).toBe(0);
    expect(result.water_ml).toBe(250);
  });

  it('handles no ledger rows and no preferences row gracefully', async () => {
    // @ts-expect-error TS(2339): mock helper
    measurementRepository.getWaterIntakeByDate.mockResolvedValue(undefined);
    // @ts-expect-error TS(2339): mock helper
    preferenceRepository.getUserPreferences.mockResolvedValue(null);

    const result = await hydrationTotalsService.resolveWaterTotalsForDate(
      'user-1',
      'user-1',
      '2026-09-05'
    );

    expect(result).toEqual({
      water_ml: 0,
      manual_ml: 0,
      ledger_ml: 0,
      food_ml: 0,
    });
  });
});
