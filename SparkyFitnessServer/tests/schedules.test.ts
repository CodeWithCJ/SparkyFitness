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
});
