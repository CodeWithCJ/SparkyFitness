import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_CALENDAR_PLANS, MAX_PLAN_ASSIGNMENTS } from '@workspace/shared';

const query = vi.hoisted(() => vi.fn());
vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(async () => ({ query, release: vi.fn() })),
  getSystemClient: vi.fn(),
}));

import { getPlanTemplatesForCalendar } from '../models/workoutPlanTemplateRepository.js';

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({ rows: [] });
});

describe('getPlanTemplatesForCalendar limits', () => {
  it('passes both limits to the database', async () => {
    await getPlanTemplatesForCalendar('u', '2026-10-01', '2026-10-31');
    const [, params] = query.mock.calls[0]!;
    expect(params).toEqual([
      'u',
      '2026-10-01',
      '2026-10-31',
      MAX_CALENDAR_PLANS,
      MAX_PLAN_ASSIGNMENTS,
    ]);
  });

  it('limits plans and assignments before aggregating, keeping the order', async () => {
    await getPlanTemplatesForCalendar('u', '2026-10-01', '2026-10-31');
    const sql = String(query.mock.calls[0]![0]).replace(/\s+/g, ' ');
    // Plans: the limit is inside the subquery the outer select reads from.
    expect(sql).toMatch(
      /FROM \( SELECT \* FROM workout_plan_templates .* ORDER BY created_at ASC LIMIT \$4 \) t/
    );
    // Assignments: the limit is inside the subquery json_agg reads from.
    expect(sql).toMatch(
      /json_agg\(x\.item ORDER BY x\.session_index ASC NULLS LAST, x\.sort_order ASC, x\.id ASC\) FROM \( SELECT .* ORDER BY a\.session_index ASC NULLS LAST, a\.sort_order ASC, a\.id ASC LIMIT \$5 \) x/
    );
  });
});
