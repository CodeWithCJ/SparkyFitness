import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
import { supplementFixed } from '../models/supplementSql.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

const sourceOf = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

// The status filter and the dose clamp decide what a supplement contributes to every total
// the app shows. Both used to be written out separately in foodMisc and reportRepository,
// which agreed by inspection and nothing else: either copy could have been edited alone and
// the result would have been a plausible number on one screen and a different plausible
// number on another, with no test and no type failing.
describe('supplement SQL has a single definition', () => {
  const models = ['../models/foodMisc.ts', '../models/reportRepository.ts'];

  it.each(models)(
    '%s builds no supplement snapshot SQL of its own',
    (relative) => {
      const source = sourceOf(relative);
      // Constructs, not identifiers: these files legitimately discuss the snapshot and the
      // dose count in prose, but neither may spell out the clamp or the correlated read.
      expect(source).not.toContain('GREATEST(COALESCE(');
      expect(source).not.toContain(
        'FROM medication_entries me WHERE me.user_id ='
      );
      expect(source).not.toContain("me.status IN ('taken', 'prn_taken')");
    }
  );

  it('both models correlate through the shared helper', () => {
    for (const relative of models) {
      expect(sourceOf(relative)).toContain("from './supplementSql.js'");
    }
  });

  // The shared helper takes the correlation expressions as arguments precisely so the two
  // callers' different date predicates ($2 vs the grouped column) do not justify a copy.
  it('emits the caller-supplied correlation, not a baked-in one', () => {
    expect(supplementFixed('calcium', '$1', '$2')).toContain(
      'me.entry_date = $2'
    );
    expect(supplementFixed('calcium', '$1', 'd.entry_date')).toContain(
      'me.entry_date = d.entry_date'
    );
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

  // The per-subquery COALESCE used to guarantee this. An un-grouped aggregate over zero
  // rows still returns one row, but every column in it is NULL, so the zeroing had to move
  // outward with the collapse or a supplement-free day would have gone out as nulls.
  it('returns zeros, not nulls, on a day with no doses', async () => {
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
    expect(sql).toContain('me.entry_date = d.entry_date');
    expect(sql).not.toContain('me.entry_date = $2');
    expect(sql).toContain("me.status IN ('taken', 'prn_taken')");
    expect(sql).toContain('GREATEST(COALESCE(me.dose_amount_snapshot, 1), 0)');
  });
});
