import type { TFunction } from 'i18next';
import { getAppLocale } from '../localization';
import type { SharedScheduleRule } from '@workspace/shared';

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
    case 'away_from_meals':
      return t('medications.mealRelation.awayFromMeals', { defaultValue: 'Away from meals' });
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
    const onDays = schedule.cycle_on_days;
    const offDays = schedule.cycle_off_days ?? 0;
    const onText = t('medications.scheduleSummary.cycleOn', {
      defaultValue: '{{count}} days on',
      count: onDays,
    });
    const offText = t('medications.scheduleSummary.cycleOff', {
      defaultValue: '{{count}} days off',
      count: offDays,
    });
    return t('medications.scheduleSummary.cycle', {
      defaultValue: '{{on}}, {{off}}',
      on: onText,
      off: offText,
    });
  }
  if (type === 'prn') {
    return t('medications.scheduleSummary.asNeeded', { defaultValue: 'As needed' });
  }
  if (type === 'taper') {
    return t('medications.scheduleSummary.taper', { defaultValue: 'Taper' });
  }
  return t('medications.scheduleSummary.unknown', { defaultValue: 'Schedule' });
}

export function localizedDescribeSchedule(t: TFunction, schedule: ScheduleFields): string {
  const frequency = localizedFrequency(t, schedule);
  if (schedule.schedule_type_id !== 'prn' && schedule.time_of_day) {
    return t('medications.scheduleSummary.at', {
      defaultValue: '{{frequency}} at {{time}}',
      frequency,
      time: formatLocalizedTimeOfDay(schedule.time_of_day),
    });
  }
  return frequency;
}

function scheduleFrequencyIdentity(schedule: ScheduleFields): string {
  const type = schedule.schedule_type_id;
  if (type === 'weekly' || type === 'specific_days') {
    return `weekly:${[...(schedule.days_of_week ?? [])].sort((a, b) => a - b).join(',')}`;
  }
  if (type === 'every_n_days') return `${type}:${schedule.interval_days ?? ''}`;
  if (type === 'monthly') return `${type}:${schedule.day_of_month ?? ''}`;
  if (type === 'cyclic') return `${type}:${schedule.cycle_on_days ?? ''}:${schedule.cycle_off_days ?? 0}`;
  return type;
}

export function localizedDescribeSchedules(
  t: TFunction,
  schedules: (ScheduleFields & { active?: boolean | null })[],
): string {
  if (schedules.length === 0) {
    return t('medications.scheduleSummary.asNeeded', { defaultValue: 'As needed' });
  }
  const active = schedules.filter((schedule) => schedule.active !== false);
  if (active.length === 0) return '';

  const grouped = new Map<string, { schedule: ScheduleFields; times: string[] }>();
  for (const schedule of active) {
    const key = scheduleFrequencyIdentity(schedule);
    const group = grouped.get(key) ?? { schedule, times: [] };
    if (schedule.schedule_type_id !== 'prn' && schedule.time_of_day) {
      group.times.push(schedule.time_of_day);
    }
    grouped.set(key, group);
  }

  return [...grouped.values()]
    .map(({ schedule, times }) => {
      const frequency = localizedFrequency(t, schedule);
      if (times.length === 0 || schedule.schedule_type_id === 'prn') return frequency;
      const formattedTimes = [...new Set(times)].sort().map((time) => formatLocalizedTimeOfDay(time));
      return t('medications.scheduleSummary.at', {
        defaultValue: '{{frequency}} at {{time}}',
        frequency,
        time: formattedTimes.join(' & '),
      });
    })
    .join('; ');
}

export function formatLocalizedTimeOfDay(timeOfDay: string, locale = getAppLocale()): string {
  const [hours, minutes] = timeOfDay.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return timeOfDay;
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
  });
}
