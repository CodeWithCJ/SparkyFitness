import {
  dayOfWeek,
  addDays,
  localDateToDay,
  standardDrinks,
  DEFAULT_STANDARD_DRINK_GRAMS,
  type AlcoholWeekResponse,
  type AlcoholDayTotal,
} from '@workspace/shared';
import preferenceRepository from '../models/preferenceRepository.js';
import reportRepository from '../models/reportRepository.js';

/**
 * Computes weekly alcohol rollup for the 7-day window containing `date`, aligned
 * to the user's preferred first day of the week.
 *
 * @param userId - ID of the target user
 * @param date - calendar day string YYYY-MM-DD
 */
export async function getAlcoholWeek(
  userId: string,
  date: string
): Promise<AlcoholWeekResponse> {
  const prefs = await preferenceRepository.getUserPreferences(userId);
  const firstDayOfWeek =
    prefs?.first_day_of_week !== null && prefs?.first_day_of_week !== undefined
      ? Number(prefs.first_day_of_week)
      : 0;
  const standardDrinkGrams =
    prefs?.standard_drink_grams !== null &&
    prefs?.standard_drink_grams !== undefined
      ? Number(prefs.standard_drink_grams)
      : DEFAULT_STANDARD_DRINK_GRAMS;
  const limitG =
    prefs?.weekly_alcohol_limit_g !== null &&
    prefs?.weekly_alcohol_limit_g !== undefined
      ? Number(prefs.weekly_alcohol_limit_g)
      : null;

  const dow = dayOfWeek(date);
  const offset = (dow - firstDayOfWeek + 7) % 7;
  const weekStart = addDays(date, -offset);
  const weekEnd = addDays(weekStart, 6);

  // Exactly one range query for the week
  const rows = await reportRepository.getDailyNutritionTotalsRange(
    userId,
    weekStart,
    weekEnd
  );

  const rowMap = new Map<string, number>();
  for (const row of rows) {
    const day =
      row.entry_date instanceof Date
        ? localDateToDay(row.entry_date)
        : String(row.entry_date).slice(0, 10);
    const alcohol = Number(row.alcohol_g) || 0;
    rowMap.set(day, alcohol);
  }

  const days: AlcoholDayTotal[] = [];
  let totalG = 0;

  for (let i = 0; i < 7; i++) {
    const currentDay = addDays(weekStart, i);
    const rawG = rowMap.get(currentDay) ?? 0;
    const alcoholG = Number(rawG.toFixed(2));
    const drinks = standardDrinks(alcoholG, standardDrinkGrams);
    totalG += alcoholG;
    days.push({
      date: currentDay,
      alcohol_g: alcoholG,
      standard_drinks: drinks,
    });
  }

  totalG = Number(totalG.toFixed(2));
  const totalDrinks = standardDrinks(totalG, standardDrinkGrams);
  const limitStandardDrinks =
    limitG !== null ? standardDrinks(limitG, standardDrinkGrams) : null;
  const overLimit = limitG !== null ? totalG > limitG : false;

  return {
    week_start: weekStart,
    week_end: weekEnd,
    total_g: totalG,
    standard_drinks: totalDrinks,
    limit_g: limitG,
    limit_standard_drinks: limitStandardDrinks,
    over_limit: overLimit,
    days,
  };
}

export default {
  getAlcoholWeek,
};
