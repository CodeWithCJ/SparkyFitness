import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FOOD_VARIANT_NUTRIENT_FIELDS } from '@workspace/shared';
import {
  createMockDbClient,
  type MockDbClient,
} from './helpers/mockDbClient.js';
import { v4 as uuidv4 } from 'uuid';
import { getClient } from '../db/poolManager.js';
import { getDailySupplementTotals } from '../models/foodMisc.js';
import { getDailyNutritionTotalsRange } from '../models/reportRepository.js';
import { supplementFixedSubquery } from '../models/supplementSql.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

describe('the shared fragments correlate on what the caller passes', () => {
  // The helper takes the correlation expressions as arguments precisely so the callers'
  // different date predicates ($2 vs a grouped column) do not justify a second copy.
  it('emits the caller-supplied correlation, not a baked-in one', () => {
    expect(supplementFixedSubquery('calcium', '$1', '$2')).toContain(
      'sup_me.entry_date = $2'
    );
    expect(supplementFixedSubquery('calcium', '$1', 'd.entry_date')).toContain(
      'sup_me.entry_date = d.entry_date'
    );
  });

  // A fragment that opens its own scan must not use the alias its callers use. With `me`
  // inside, a caller correlating on its own `me` would emit `me.user_id = me.user_id`: a
  // self-join tautology that runs clean and silently sums the user's whole history rather
  // than one day. The alias is the only thing preventing it, so assert on it directly.
  it('does not shadow a caller that correlates on its own me', () => {
    const sql = supplementFixedSubquery('iron', 'me.user_id', 'me.entry_date');
    // Derived, not hardcoded: the property that matters is that the inner alias differs
    // from the caller's, not that it is spelled `sup_me`. Pinning the literal would reject
    // a future rename that is equally safe while proving nothing extra.
    const innerAlias = sql.match(/FROM medication_entries (\w+)/)?.[1];
    expect(innerAlias, 'no inner scan found').toBeTruthy();
    expect(innerAlias).not.toBe('me');
    expect(sql).toContain(`${innerAlias}.user_id = me.user_id`);
    expect(sql).toContain(`${innerAlias}.entry_date = me.entry_date`);
    // Boundary-anchored: a plain substring check would pass on `sup_me.user_id = me.user_id`
    // and assert nothing, since the correct string ends with the wrong one.
    expect(sql).not.toMatch(/(?<![\w.])me\.user_id = me\.user_id/);
    expect(sql).not.toMatch(/(?<![\w.])me\.entry_date = me\.entry_date/);
  });
});

describe('getDailySupplementTotals reads the day in one pass', () => {
  let mockClient: MockDbClient;
  const userId = uuidv4();

  beforeEach(() => {
    mockClient = createMockDbClient([{}]);
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => vi.clearAllMocks());

  const sqlOf = () => String(mockClient.query.mock.calls[0][0]);

  // This query has no food arm to correlate against, so seventeen scalar subqueries each
  // rescanning the same handful of rows bought nothing. One scan for the fixed fields and
  // one for the custom aggregation is the whole query.
  it('scans medication_entries twice, not once per nutrient', async () => {
    await getDailySupplementTotals(userId, '2026-08-19');
    const sql = sqlOf();
    const scans = sql.match(/FROM medication_entries/g) ?? [];
    expect(scans).toHaveLength(2);
    expect(FOOD_VARIANT_NUTRIENT_FIELDS.length).toBeGreaterThan(scans.length);
  });

  it('still selects every shared nutrient field', async () => {
    await getDailySupplementTotals(userId, '2026-08-19');
    const sql = sqlOf();
    for (const field of FOOD_VARIANT_NUTRIENT_FIELDS) {
      expect(sql, `missing ${field}`).toContain(
        `nutrients_snapshot->>'${field}'`
      );
      expect(sql, `missing alias for ${field}`).toContain(
        `COALESCE(supplement_fixed.${field}, 0) AS ${field}`
      );
    }
  });

  // Each inner aggregate must be published under the name of the nutrient it reads.
  // Asserting the snapshot keys and the outer aliases separately leaves them unbound:
  // swapping just the two inner `AS` names preserves every key and every outer alias, so a
  // dose of 100 calories and 5g protein comes back as 5 calories and 100g protein with the
  // assertions above still green. Pair them off the line that generates both.
  it('publishes each inner aggregate under the nutrient it reads', async () => {
    await getDailySupplementTotals(userId, '2026-08-19');
    const pairs = sqlOf()
      .split('\n')
      .filter((line) => /nutrients_snapshot->>'/.test(line))
      .map((line) => [
        line.match(/nutrients_snapshot->>'(\w+)'/)?.[1],
        line.match(/\bAS (\w+),?\s*$/)?.[1],
      ]);
    expect(pairs).toEqual(
      FOOD_VARIANT_NUTRIENT_FIELDS.map((field) => [field, field])
    );
  });

  // NOTE: this covers the JS coercion only, not the SQL. It feeds an all-NULL row through
  // the mock, and `Number(null) || 0` is 0 regardless of what the query said, so it passes
  // with or without the outer COALESCE. The SQL-level zeroing is asserted as a string by
  // 'still selects every shared nutrient field' above; that is the assertion a mutation
  // kills. Kept because the coercion is a real contract (callers add these unconditionally),
  // but do not read it as a guard on the query.
  it('coerces a NULL row to zeros, not nulls', async () => {
    const nullRow = Object.fromEntries(
      FOOD_VARIANT_NUTRIENT_FIELDS.map((field) => [field, null])
    );
    mockClient = createMockDbClient([{ ...nullRow, custom_nutrients: {} }]);
    vi.mocked(getClient).mockResolvedValue(mockClient);

    const totals = await getDailySupplementTotals(userId, '2026-08-19');
    for (const field of FOOD_VARIANT_NUTRIENT_FIELDS) {
      expect(totals[field], `${field} came back non-zero`).toBe(0);
    }
    expect(totals.custom_nutrients).toEqual({});
  });

  it('keeps the status filter and the dose clamp on the single scan', async () => {
    await getDailySupplementTotals(userId, '2026-08-19');
    const sql = sqlOf();
    expect(sql).toContain("me.status IN ('taken', 'prn_taken')");
    expect(sql).toContain('GREATEST(COALESCE(me.dose_amount_snapshot, 1), 0)');
    expect(sql).toContain('me.nutrients_snapshot IS NOT NULL');
  });
});

describe('the range query keeps its supplement arm', () => {
  let mockClient: MockDbClient;
  const userId = uuidv4();

  beforeEach(() => {
    mockClient = createMockDbClient([{}]);
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => vi.clearAllMocks());

  // reportRepository's copy is gone, so this asserts the shared helper reaches it with the
  // per-date correlation it needs rather than the bind param the diary query uses.
  it('correlates supplements on the grouped date', async () => {
    await getDailyNutritionTotalsRange(userId, '2026-08-01', '2026-08-19');
    const sql = String(mockClient.query.mock.calls[0][0]);
    expect(sql).toContain('sup_me.entry_date = d.entry_date');
    expect(sql).not.toContain('sup_me.entry_date = $2');
    expect(sql).toContain("sup_me.status IN ('taken', 'prn_taken')");
    expect(sql).toContain(
      'GREATEST(COALESCE(sup_me.dose_amount_snapshot, 1), 0)'
    );
  });
});
