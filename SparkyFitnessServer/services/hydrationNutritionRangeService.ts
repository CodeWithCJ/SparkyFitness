import { addDays, compareDays, localDateToDay } from '@workspace/shared';
import type { HydrationNutritionDayTotal } from '@workspace/shared';
import measurementRepository from '../models/measurementRepository.js';
import reportRepository from '../models/reportRepository.js';

// #2348: caffeine_mg/alcohol_g come straight from getDailyNutritionTotalsRange
// (RANGE_COLS, already fed by Phases 1 and 7). water_ml needs its own query
// because water_ml is deliberately excluded from RANGE_COLS (design-decisions
// correction 3) -- getWaterTotalsByDateRange already carries the Phase 4
// add_food_water_to_intake food arm, so this total agrees with the Diary.
export async function getHydrationNutritionRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{ days: HydrationNutritionDayTotal[] }> {
  const [waterRows, nutritionRows] = await Promise.all([
    measurementRepository.getWaterTotalsByDateRange(userId, startDate, endDate),
    reportRepository.getDailyNutritionTotalsRange(userId, startDate, endDate),
  ]);

  const toDayKey = (value: unknown): string =>
    value instanceof Date ? localDateToDay(value) : String(value).slice(0, 10);

  const waterByDate = new Map<string, number>();
  for (const row of waterRows as Array<{
    entry_date: unknown;
    total_ml: string | number;
  }>) {
    waterByDate.set(toDayKey(row.entry_date), Number(row.total_ml) || 0);
  }

  const nutritionByDate = new Map<
    string,
    { caffeine_mg: number; alcohol_g: number }
  >();
  for (const row of nutritionRows as Array<{
    entry_date: unknown;
    caffeine_mg?: string | number;
    alcohol_g?: string | number;
  }>) {
    nutritionByDate.set(toDayKey(row.entry_date), {
      caffeine_mg: Number(row.caffeine_mg) || 0,
      alcohol_g: Number(row.alcohol_g) || 0,
    });
  }

  const days: HydrationNutritionDayTotal[] = [];
  for (
    let day = startDate;
    compareDays(day, endDate) <= 0;
    day = addDays(day, 1)
  ) {
    const nutrition = nutritionByDate.get(day);
    days.push({
      date: day,
      water_ml: waterByDate.get(day) ?? 0,
      caffeine_mg: nutrition?.caffeine_mg ?? 0,
      alcohol_g: nutrition?.alcohol_g ?? 0,
    });
  }

  return { days };
}

export default { getHydrationNutritionRange };
