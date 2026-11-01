import { describe, expect, it } from 'vitest';
import { placeWeeklyGoalPlan } from '../utils/weeklyGoalPlanTimeline.js';

const october = {
  id: 'october',
  plan_name: 'October',
  start_date: '2026-10-01',
  end_date: null,
};

describe('placing a switched-on weekly goal plan', () => {
  it('ends the plan in force the day before a new plan starts', () => {
    expect(
      placeWeeklyGoalPlan(
        [october],
        { start_date: '2026-11-01', end_date: null },
        true
      )
    ).toEqual({
      ok: true,
      end: [{ id: 'october', end_date: '2026-10-31' }],
      deactivate: [],
    });
  });

  it('also ends a plan in force that has an end date past the new start', () => {
    expect(
      placeWeeklyGoalPlan(
        [{ ...october, end_date: '2026-12-31' }],
        { start_date: '2026-11-01', end_date: null },
        true
      )
    ).toEqual({
      ok: true,
      end: [{ id: 'october', end_date: '2026-10-31' }],
      deactivate: [],
    });
  });

  it('switches off a plan in force that starts the same day', () => {
    expect(
      placeWeeklyGoalPlan(
        [october],
        { start_date: '2026-10-01', end_date: null },
        true
      )
    ).toEqual({ ok: true, end: [], deactivate: ['october'] });
  });

  it('leaves a plan that already ended before the new start', () => {
    expect(
      placeWeeklyGoalPlan(
        [{ ...october, end_date: '2026-10-15' }],
        { start_date: '2026-11-01', end_date: null },
        true
      )
    ).toEqual({ ok: true, end: [], deactivate: [] });
  });

  it('refuses a new plan that starts before a later plan', () => {
    const november = {
      id: 'november',
      plan_name: 'November',
      start_date: '2026-11-01',
      end_date: null,
    };
    expect(
      placeWeeklyGoalPlan(
        [{ ...october, end_date: '2026-10-31' }, november],
        { start_date: '2026-10-15', end_date: '2026-10-20' },
        true
      )
    ).toEqual({ ok: false, overlaps: { ...october, end_date: '2026-10-31' } });
  });

  it('refuses an edit that pushes an end date over the next plan', () => {
    const november = {
      id: 'november',
      plan_name: 'November',
      start_date: '2026-11-01',
      end_date: null,
    };
    expect(
      placeWeeklyGoalPlan(
        [november],
        { start_date: '2026-10-01', end_date: '2026-11-05' },
        false
      )
    ).toEqual({ ok: false, overlaps: november });
  });

  it('refuses an edit that moves a start date back over the plan before', () => {
    expect(
      placeWeeklyGoalPlan(
        [{ ...october, end_date: '2026-10-31' }],
        { start_date: '2026-10-20', end_date: null },
        false
      )
    ).toEqual({ ok: false, overlaps: { ...october, end_date: '2026-10-31' } });
  });

  it('accepts an edit that overlaps nothing', () => {
    expect(
      placeWeeklyGoalPlan(
        [{ ...october, end_date: '2026-10-31' }],
        { start_date: '2026-11-01', end_date: '2026-11-30' },
        false
      )
    ).toEqual({ ok: true, end: [], deactivate: [] });
  });
});
