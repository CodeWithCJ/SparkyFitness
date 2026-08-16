import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getGoalModeAdjustment } from '@workspace/shared';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  here,
  '../db/migrations/20260816173934_flip_goal_mode_custom_percentage_sign.sql'
);

/**
 * Migration 20260816173934 flipped the stored sign convention of
 * goal_mode_custom_percentage so that positive means a surplus.
 *
 * A sign error here silently inverts real users' goals -- someone cutting would
 * start bulking -- so the intent is pinned down in both directions.
 */
describe('goal_mode_custom_percentage sign flip migration', () => {
  const raw = readFileSync(MIGRATION, 'utf8');
  // Strip `--` comments so assertions test the statement, not the rationale.
  const sql = raw
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

  it('negates stored percentages', () => {
    expect(sql).toMatch(
      /SET\s+goal_mode_custom_percentage\s*=\s*-goal_mode_custom_percentage/i
    );
  });

  it('negates only positive values, limiting the blast radius of a replay', () => {
    // Not idempotent -- nothing can be, since after migration a positive value
    // is a legitimate surplus and indistinguishable from a legacy deficit.
    // Single execution comes from the migration runner's tracking table. `> 0`
    // selects exactly the same rows as `<> 0` at the moment of running, because
    // the old convention validated the column to [0, 40].
    expect(sql).toMatch(/WHERE\s+goal_mode_custom_percentage\s*>\s*0/i);
  });

  it('does not restrict the flip to a single goal_mode', () => {
    // Stale values on non-manual modes must also carry the new convention, in
    // case the user later switches to manual.
    expect(sql).not.toMatch(/WHERE[\s\S]*goal_mode\s*=/i);
  });

  it('preserves the meaning of a migrated value end to end', () => {
    // A user who stored 20 under the old convention meant "cut 20%".
    const storedBefore = 20;
    const storedAfter = -storedBefore; // what the migration writes

    // Under the new convention that still resolves to a 20% deficit.
    expect(getGoalModeAdjustment('manual', storedAfter)).toBeCloseTo(0.2, 10);

    // And had the migration not run, the same stored value would now mean the
    // opposite -- a 20% surplus. This is the regression the migration prevents.
    expect(getGoalModeAdjustment('manual', storedBefore)).toBeCloseTo(-0.2, 10);
  });

  it('maps the new user-facing convention the way the UI describes it', () => {
    // "Positive adds calories (surplus), negative cuts them (deficit)."
    expect(getGoalModeAdjustment('manual', 15)).toBeLessThan(0); // surplus
    expect(getGoalModeAdjustment('manual', -15)).toBeGreaterThan(0); // deficit
  });
});
