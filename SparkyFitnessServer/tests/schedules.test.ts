import { describe, expect, it } from 'vitest';
import {
  isScheduleDueOnDate,
  getDueDosesForDate,
  type SharedScheduleRule,
} from '@workspace/shared';

describe('isScheduleDueOnDate helper', () => {
  it('handles inactive schedules', () => {
    const sched: SharedScheduleRule = {
      schedule_type_id: 'daily',
      active: false,
    };
    expect(isScheduleDueOnDate(sched, '2026-06-25')).toBe(false);
  });

  it('respects start and end date boundaries', () => {
    const sched: SharedScheduleRule = {
      schedule_type_id: 'daily',
      start_date: '2026-06-20',
      end_date: '2026-06-24',
      active: true,
    };
    expect(isScheduleDueOnDate(sched, '2026-06-19')).toBe(false);
    expect(isScheduleDueOnDate(sched, '2026-06-22')).toBe(true);
    expect(isScheduleDueOnDate(sched, '2026-06-25')).toBe(false);
  });

  it('checks daily schedules', () => {
    const sched: SharedScheduleRule = {
      schedule_type_id: 'daily',
      active: true,
    };
    expect(isScheduleDueOnDate(sched, '2026-06-25')).toBe(true);
  });

  it('checks specific days / weekly schedules', () => {
    // 2026-06-25 is a Thursday (4)
    // 2026-06-26 is a Friday (5)
    const sched: SharedScheduleRule = {
      schedule_type_id: 'weekly',
      days_of_week: [1, 3, 5], // Mon, Wed, Fri
      active: true,
    };
    expect(isScheduleDueOnDate(sched, '2026-06-25')).toBe(false); // Thursday
    expect(isScheduleDueOnDate(sched, '2026-06-26')).toBe(true); // Friday
  });

  it('checks every N days schedules', () => {
    const sched: SharedScheduleRule = {
      schedule_type_id: 'every_n_days',
      interval_days: 3,
      start_date: '2026-06-20', // Day 0
      active: true,
    };
    expect(isScheduleDueOnDate(sched, '2026-06-20')).toBe(true); // Day 0
    expect(isScheduleDueOnDate(sched, '2026-06-21')).toBe(false); // Day 1
    expect(isScheduleDueOnDate(sched, '2026-06-23')).toBe(true); // Day 3
    expect(isScheduleDueOnDate(sched, '2026-06-26')).toBe(true); // Day 6
  });

  it('checks monthly schedules', () => {
    const sched: SharedScheduleRule = {
      schedule_type_id: 'monthly',
      day_of_month: 25,
      active: true,
    };
    expect(isScheduleDueOnDate(sched, '2026-06-25')).toBe(true);
    expect(isScheduleDueOnDate(sched, '2026-06-26')).toBe(false);

    // Test last-day-of-month fallback (Feb 28/29 for 30th/31st schedule)
    const endOfMonthSched: SharedScheduleRule = {
      schedule_type_id: 'monthly',
      day_of_month: 31,
      active: true,
    };
    // Feb 28, 2026 (non-leap year)
    expect(isScheduleDueOnDate(endOfMonthSched, '2026-02-28')).toBe(true);
    expect(isScheduleDueOnDate(endOfMonthSched, '2026-02-27')).toBe(false);
  });

  it('checks cyclic schedules', () => {
    const sched: SharedScheduleRule = {
      schedule_type_id: 'cyclic',
      cycle_on_days: 5,
      cycle_off_days: 2,
      start_date: '2026-06-01', // Monday
      active: true,
    };
    // Day 0..4 (June 1-5): due
    expect(isScheduleDueOnDate(sched, '2026-06-01')).toBe(true);
    expect(isScheduleDueOnDate(sched, '2026-06-05')).toBe(true);
    // Day 5..6 (June 6-7): not due
    expect(isScheduleDueOnDate(sched, '2026-06-06')).toBe(false);
    expect(isScheduleDueOnDate(sched, '2026-06-07')).toBe(false);
    // Day 7 (June 8): due again
    expect(isScheduleDueOnDate(sched, '2026-06-08')).toBe(true);
  });

  it('ignores PRN schedules', () => {
    const sched: SharedScheduleRule = {
      schedule_type_id: 'prn',
      active: true,
    };
    expect(isScheduleDueOnDate(sched, '2026-06-25')).toBe(false);
  });
});

describe('getDueDosesForDate helper', () => {
  it('correctly filters and matches due doses', () => {
    const meds = [
      {
        id: 'med-1',
        is_active: true,
        name: 'Daily Med',
        schedules: [{ id: 'sched-1', schedule_type_id: 'daily', active: true }],
      },
      {
        id: 'med-2',
        is_active: true,
        name: 'Weekly Med',
        schedules: [
          {
            id: 'sched-2',
            schedule_type_id: 'weekly',
            days_of_week: [5],
            active: true,
          }, // Friday
        ],
      },
      {
        id: 'med-3',
        is_active: false,
        name: 'Inactive Med',
        schedules: [{ id: 'sched-3', schedule_type_id: 'daily', active: true }],
      },
      {
        id: 'med-4',
        is_active: true,
        name: 'PRN Med',
        schedules: [{ id: 'sched-4', schedule_type_id: 'prn', active: true }],
      },
    ];

    // June 25, 2026 is Thursday
    const dosesOnThursday = getDueDosesForDate(meds, '2026-06-25');
    expect(dosesOnThursday).toHaveLength(1);
    expect(dosesOnThursday[0]?.medication.id).toBe('med-1');
    expect(dosesOnThursday[0]?.schedule.id).toBe('sched-1');

    // June 26, 2026 is Friday
    const dosesOnFriday = getDueDosesForDate(meds, '2026-06-26');
    expect(dosesOnFriday).toHaveLength(2);
    expect(dosesOnFriday.map((d) => d.medication.id)).toContain('med-1');
    expect(dosesOnFriday.map((d) => d.medication.id)).toContain('med-2');
  });

  it('skips past days when a medication was created after the queried date (issue #1915)', () => {
    // A daily medication added on 2026-06-25 should not be "due" on 2026-06-24,
    // otherwise the 14-day adherence window would falsely count missed doses
    // on days when the medication didn't exist yet.
    const meds = [
      {
        id: 'med-new',
        is_active: true,
        name: 'New Med',
        created_at: '2026-06-25T14:30:00.000Z',
        schedules: [
          { id: 'sched-new', schedule_type_id: 'daily', active: true },
        ],
      },
    ];

    // Before creation -> no due doses
    expect(getDueDosesForDate(meds, '2026-06-24')).toHaveLength(0);
    expect(getDueDosesForDate(meds, '2026-06-23')).toHaveLength(0);
    expect(getDueDosesForDate(meds, '2026-01-01')).toHaveLength(0);

    // On/after creation -> daily dose is due
    const onCreationDay = getDueDosesForDate(meds, '2026-06-25');
    expect(onCreationDay).toHaveLength(1);
    expect(onCreationDay[0]?.medication.id).toBe('med-new');

    const afterCreation = getDueDosesForDate(meds, '2026-06-26');
    expect(afterCreation).toHaveLength(1);
    expect(afterCreation[0]?.medication.id).toBe('med-new');
  });

  it('honors explicit schedule start_date even when set before created_at', () => {
    // An imported schedule with start_date before the medication's created_at
    // should still count historical doses (e.g. back-filled histories).
    const meds = [
      {
        id: 'med-imported',
        is_active: true,
        name: 'Imported Med',
        created_at: '2026-06-25T14:30:00.000Z',
        schedules: [
          {
            id: 'sched-imported',
            schedule_type_id: 'daily',
            start_date: '2026-06-20',
            active: true,
          },
        ],
      },
    ];

    // start_date wins -> historical doses are still due
    const historical = getDueDosesForDate(meds, '2026-06-22');
    expect(historical).toHaveLength(1);
    expect(historical[0]?.medication.id).toBe('med-imported');

    const onCreation = getDueDosesForDate(meds, '2026-06-25');
    expect(onCreation).toHaveLength(1);
  });

  it('still filters out schedules before explicit start_date when start_date is after created_at', () => {
    const meds = [
      {
        id: 'med-future',
        is_active: true,
        name: 'Future Start Med',
        created_at: '2026-06-10T08:00:00.000Z',
        schedules: [
          {
            id: 'sched-future',
            schedule_type_id: 'daily',
            start_date: '2026-06-20',
            active: true,
          },
        ],
      },
    ];

    expect(getDueDosesForDate(meds, '2026-06-15')).toHaveLength(0);
    expect(getDueDosesForDate(meds, '2026-06-19')).toHaveLength(0);
    expect(getDueDosesForDate(meds, '2026-06-20')).toHaveLength(1);
  });

  it('handles medications without created_at (legacy data) without regressing', () => {
    const meds = [
      {
        id: 'med-legacy',
        is_active: true,
        name: 'Legacy Med',
        schedules: [
          { id: 'sched-legacy', schedule_type_id: 'daily', active: true },
        ],
      },
    ];

    expect(getDueDosesForDate(meds, '2020-01-01')).toHaveLength(1);
    expect(getDueDosesForDate(meds, '2026-06-25')).toHaveLength(1);
  });

  it('handles a 14-day adherence window for a medication added today', () => {
    // Reproduces the exact scenario from issue #1915: a daily medication added
    // today should yield 1 due dose today and 0 due doses across the past 13
    // days, not 14 missed doses.
    const meds = [
      {
        id: 'med-today',
        is_active: true,
        name: 'Today Med',
        created_at: '2026-07-25T12:00:00.000Z',
        schedules: [
          { id: 'sched-today', schedule_type_id: 'daily', active: true },
        ],
      },
    ];

    let dueAcrossWindow = 0;
    for (let i = 13; i >= 0; i--) {
      const anchor = new Date('2026-07-25T12:00:00.000Z');
      anchor.setUTCDate(anchor.getUTCDate() - i);
      const dStr = anchor.toISOString().substring(0, 10);
      dueAcrossWindow += getDueDosesForDate(meds, dStr).length;
    }

    expect(dueAcrossWindow).toBe(1);
  });
});
