import i18n from '@/i18n';
import {
  Pill,
  Syringe,
  Tablets,
  FlaskConical,
  Bandage,
  SprayCan,
  Pipette,
  Droplets,
  Package,
  type LucideIcon,
} from 'lucide-react';
import type { MedicationSchedule } from '@/types/medications';

export const MED_TYPES = [
  'pill',
  'tablet',
  'capsule',
  'liquid',
  'injection',
  'patch',
  'inhaler',
  'drops',
  'cream',
  'suppository',
  'other',
];

export const MED_TYPE_ICONS: Record<string, LucideIcon> = {
  pill: Pill,
  tablet: Tablets,
  capsule: Pill,
  liquid: FlaskConical,
  injection: Syringe,
  patch: Bandage,
  inhaler: SprayCan,
  drops: Pipette,
  cream: Droplets,
  suppository: Pill,
  other: Package,
};

export const MED_TYPE_COLORS: Record<string, string> = {
  pill: 'text-rose-500',
  tablet: 'text-amber-500',
  capsule: 'text-orange-500',
  liquid: 'text-cyan-500',
  injection: 'text-blue-500',
  patch: 'text-violet-500',
  inhaler: 'text-teal-500',
  drops: 'text-sky-500',
  cream: 'text-pink-500',
  suppository: 'text-fuchsia-500',
  other: 'text-slate-500',
};

export const formatDaysOfWeek = (days: number[] | null) => {
  if (!days || days.length === 0) return '';
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.map((d) => names[d] ?? '').join(', ');
};

export const formatScheduleDescription = (sched: MedicationSchedule) => {
  const timeStr = sched.time_of_day
    ? i18n.t('medications.scheduleDesc.atTime', ' at {{time}}', {
        time: sched.time_of_day.substring(0, 5),
      })
    : '';
  const mealStr = sched.with_meal
    ? i18n.t('medications.scheduleDesc.mealSuffix', ' ({{meal}} meal)', {
        meal: sched.with_meal,
      })
    : '';

  switch (sched.schedule_type_id) {
    case 'daily':
      return `${i18n.t('medications.scheduleDesc.daily', 'Daily')}${timeStr}${mealStr}`;
    case 'weekly':
    case 'specific_days':
      return `${i18n.t('medications.scheduleDesc.weeklyOn', 'Weekly on {{days}}', { days: formatDaysOfWeek(sched.days_of_week) })}${timeStr}${mealStr}`;
    case 'every_n_days':
      return `${i18n.t('medications.scheduleDesc.everyNDays', 'Every {{n}} days', { n: sched.interval_days })}${timeStr}${mealStr}`;
    case 'cyclic':
      return `${i18n.t('medications.scheduleDesc.cyclic', 'Cycle: {{on}} days on, {{off}} days off', { on: sched.cycle_on_days, off: sched.cycle_off_days })}${timeStr}${mealStr}`;
    case 'monthly':
      return `${i18n.t('medications.scheduleDesc.monthly', 'Monthly on day {{day}}', { day: sched.day_of_month })}${timeStr}${mealStr}`;
    case 'prn':
      return `${i18n.t('medications.scheduleDesc.prn', 'As needed (PRN)')}${sched.prn_reason ? `: ${sched.prn_reason}` : ''}`;
    case 'taper':
      return `${i18n.t('medications.scheduleDesc.taper', 'Taper / titration')}${timeStr}${mealStr}`;
    default:
      return `${sched.schedule_type_id}${timeStr}${mealStr}`;
  }
};
