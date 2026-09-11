import measurementRepository from '../models/measurementRepository.js';
import foodRepository from '../models/foodMisc.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { log } from '../config/logging.js';

interface WaterTotals {
  water_ml: number;
  manual_ml: number;
  ledger_ml: number;
  food_ml: number;
}

/**
 * Single owner of the water-total formula (#1557, #1629): the ledger total
 * (water_intake_entries, all sources) plus food-derived water when the user
 * has opted in via add_food_water_to_intake. food_ml is always 0 for an
 * opted-out user, so this is a strict superset of the pre-Phase-4 behavior.
 *
 * _actingUserId is accepted (not used below) to keep this call's signature
 * stable for callers that need it for permission checks upstream -- the
 * repository reads here are already scoped to targetUserId via RLS.
 */
async function resolveWaterTotalsForDate(
  targetUserId: string,
  _actingUserId: string,
  date: string
): Promise<WaterTotals> {
  const [ledgerResult, preferences] = await Promise.all([
    measurementRepository.getWaterIntakeByDate(targetUserId, date),
    preferenceRepository.getUserPreferences(targetUserId),
  ]);

  const ledgerMl = parseFloat(ledgerResult?.water_ml) || 0;
  const manualMl = parseFloat(ledgerResult?.manual_ml) || 0;

  const includeFoodWater = Boolean(preferences?.add_food_water_to_intake);
  const foodMl = includeFoodWater
    ? await foodRepository
        .getFoodDerivedWaterMlForDate(targetUserId, date)
        .catch((error: unknown) => {
          log(
            'warn',
            `Food-derived water fetch failed for user ${targetUserId} on ${date}, defaulting to 0:`,
            error
          );
          return 0;
        })
    : 0;

  return {
    water_ml: ledgerMl + foodMl,
    manual_ml: manualMl,
    ledger_ml: ledgerMl,
    food_ml: foodMl,
  };
}

export { resolveWaterTotalsForDate };
export default { resolveWaterTotalsForDate };
