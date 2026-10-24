import { getClient } from '../db/poolManager.js';
import { CALORIE_RULE_FIELDS } from '@workspace/shared';
import type { CalorieRules } from '@workspace/shared';

export type CalorieRuleHistoryRow = CalorieRules & {
  /** 'YYYY-MM-DD', or '-infinity' for the rules before the first recorded change. */
  effective_date: string;
};

/**
 * The rows that decide the calorie rules of each day from `startDate` to
 * `endDate`, oldest first: the latest row on or before `startDate`, then
 * every row inside the range. Empty when the user never changed a rule.
 */
async function getCalorieRuleHistory(
  userId: string,
  startDate: string,
  endDate: string
): Promise<CalorieRuleHistoryRow[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT ${CALORIE_RULE_FIELDS.join(', ')}, effective_date::text AS effective_date
       FROM user_calorie_rule_history
       WHERE user_id = $1
         AND effective_date <= $3::date
         AND effective_date >= COALESCE(
           (SELECT max(effective_date) FROM user_calorie_rule_history
            WHERE user_id = $1 AND effective_date <= $2::date),
           '-infinity'::date
         )
       ORDER BY effective_date`,
      [userId, startDate, endDate]
    );
    return result.rows as CalorieRuleHistoryRow[];
  } finally {
    client.release();
  }
}

export { getCalorieRuleHistory };
export default { getCalorieRuleHistory };
