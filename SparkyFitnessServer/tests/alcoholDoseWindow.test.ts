import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getNutrientDosesForWindow } from '../models/foodMisc.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));

const userId = '11111111-1111-1111-1111-111111111111';
const query = vi.fn();
const release = vi.fn();

// Blood alcohol reads its doses through the query caffeine uses, with
// alcohol_g. caffeineDoseWindow.test.ts mocks the query away, so this runs
// it against a mocked client and checks the SQL it sends.
describe('getNutrientDosesForWindow with alcohol_g', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue({ rows: [] });
    vi.mocked(getClient).mockResolvedValue({ query, release } as never);
  });

  async function sqlFor(field: 'alcohol_g' | 'caffeine_mg') {
    await getNutrientDosesForWindow(userId, '2026-11-06', '2026-11-07', field);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    query.mockClear();
    return { sql, params };
  }

  it('scales alcohol_g by quantity over serving size, like caffeine', async () => {
    const { sql } = await sqlFor('alcohol_g');

    expect(sql).toContain(
      '(fe.alcohol_g * fe.quantity / NULLIF(fe.serving_size, 0))::numeric AS amount'
    );
    expect(sql).toContain('AND fe.alcohol_g > 0');
    expect(sql).toContain("me.nutrients_snapshot->>'alcohol_g'");
    expect(sql).not.toContain('caffeine_mg');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('uses the same window bounds as caffeine', async () => {
    const alcohol = await sqlFor('alcohol_g');
    const caffeine = await sqlFor('caffeine_mg');

    expect(alcohol.params).toEqual([userId, '2026-11-06', '2026-11-07']);
    expect(alcohol.params).toEqual(caffeine.params);
    for (const bound of [
      'fe.entry_date >= $2',
      'fe.entry_date <= $3',
      'me.entry_date >= $2',
      'me.entry_date <= $3',
    ]) {
      expect(alcohol.sql).toContain(bound);
    }
    expect(alcohol.sql.replaceAll('alcohol_g', 'caffeine_mg')).toBe(
      caffeine.sql
    );
  });
});
