import type { TFunction } from 'i18next';
import { formatTimeOfDay, type SharedScheduleRule } from '@workspace/shared';

type ScheduleFields = Pick<
  SharedScheduleRule,
  | 'schedule_type_id'
  | 'time_of_day'
  | 'days_of_week'
  | 'interval_days'
  | 'day_of_month'
  | 'cycle_on_days'
  | 'cycle_off_days'
>;

export function localizedWeekdayLabels(t: TFunction): string[] {
  return [
    t('medications.weekdays.sun', { defaultValue: 'Sunday' }),
    t('medications.weekdays.mon', { defaultValue: 'Monday' }),
    t('medications.weekdays.tue', { defaultValue: 'Tuesday' }),
    t('medications.weekdays.wed', { defaultValue: 'Wednesday' }),
    t('medications.weekdays.thu', { defaultValue: 'Thursday' }),
    t('medications.weekdays.fri', { defaultValue: 'Friday' }),
    t('medications.weekdays.sat', { defaultValue: 'Saturday' }),
  ];
}

export function localizedMealTimingLabel(t: TFunction, value: string): string {
  switch (value) {
    case 'before':
      return t('medications.types.beforeMeal', { defaultValue: 'Before meal' });
    case 'with':
      return t('medications.types.withMeal', { defaultValue: 'With meal' });
    case 'after':
      return t('medications.types.afterMeal', { defaultValue: 'After meal' });
    default:
      return value;
  }
}

function localizedFrequency(t: TFunction, schedule: ScheduleFields): string {
  const type = schedule.schedule_type_id;
  if (type === 'daily') {
    return t('medications.scheduleSummary.daily', { defaultValue: 'Daily' });
  }
  if (type === 'weekly' || type === 'specific_days') {
    if (!schedule.days_of_week?.length) {
      return t('medications.scheduleSummary.weekly', { defaultValue: 'Weekly' });
    }
    const days = localizedWeekdayLabels(t);
    return [...schedule.days_of_week]
      .sort((a, b) => a - b)
      .map((day) => days[day])
      .filter(Boolean)
      .join(', ');
  }
  if (type === 'every_n_days' && schedule.interval_days != null && schedule.interval_days > 0) {
    if (schedule.interval_days === 1) {
      return t('medications.scheduleSummary.daily', { defaultValue: 'Daily' });
    }
    return t('medications.scheduleSummary.everyNDays', {
      defaultValue: 'Every {{count}} days',
      count: schedule.interval_days,
    });
  }
  if (type === 'monthly') {
    return schedule.day_of_month != null
      ? t('medications.scheduleSummary.monthlyOnDay', {
          defaultValue: 'Monthly on day {{day}}',
          day: schedule.day_of_month,
        })
      : t('medications.scheduleSummary.monthly', { defaultValue: 'Monthly' });
  }
  if (type === 'cyclic' && schedule.cycle_on_days != null && schedule.cycle_on_days > 0) {
    return t('medications.scheduleSummary.cycle', {
      defaultValue: '{{on}} days on, {{off}} days off',
      on: schedule.cycle_on_days,
      off: schedule.cycle_off_days ?? 0,
    });
  }
  if (type === 'prn') {
    return t('medications.scheduleSummary.asNeeded', { defaultValue: 'As needed' });
  }
  if (type === 'taper') {
    return t('medications.scheduleSummary.taper', { defaultValue: 'Taper' });
  }
  const words = type.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function localizedDescribeSchedule(t: TFunction, schedule: ScheduleFields): string {
  const frequency = localizedFrequency(t, schedule);
  if (schedule.schedule_type_id !== 'prn' && schedule.time_of_day) {
    return t('medications.scheduleSummary.at', {
      defaultValue: '{{frequency}} at {{time}}',
      frequency,
      time: formatTimeOfDay(schedule.time_of_day),
    });
  }
  return frequency;
}

export function localizedDescribeSchedules(
  t: TFunction,
  schedules: Array<ScheduleFields & { active?: boolean | null }>,
): string {
  const active = schedules.filter((schedule) => schedule.active !== false);
  if (active.length === 0) return '';
  if (active.length === 1) return localizedDescribeSchedule(t, active[0]);
  return active.map((schedule) => localizedDescribeSchedule(t, schedule)).join('; ');
}
