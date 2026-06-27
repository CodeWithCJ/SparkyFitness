import { dayOfWeek } from '../utils/timezone.ts';

export interface SharedScheduleRule {
  schedule_type_id: string;
  time_of_day?: string | null;
  days_of_week?: number[] | null;
  interval_days?: number | null;
  day_of_month?: number | null;
  cycle_on_days?: number | null;
  cycle_off_days?: number | null;
  start_date?: string | null; // YYYY-MM-DD
  end_date?: string | null;   // YYYY-MM-DD
  active?: boolean;
  dose_amount?: number | null;
  with_meal?: string | null;
}

/**
 * Returns true if a schedule is due on a given calendar day (YYYY-MM-DD format).
 */
export function isScheduleDueOnDate(schedule: SharedScheduleRule, dateString: string): boolean {
  if (schedule.active === false) return false;

  // Check date ranges if present
  if (schedule.start_date && dateString < schedule.start_date) return false;
  if (schedule.end_date && dateString > schedule.end_date) return false;

  const type = schedule.schedule_type_id;

  if (type === 'daily') {
    return true;
  }

  if (type === 'weekly' || type === 'specific_days') {
    if (!schedule.days_of_week || schedule.days_of_week.length === 0) return false;
    const dow = dayOfWeek(dateString);
    return schedule.days_of_week.includes(dow);
  }

  if (type === 'every_n_days') {
    if (!schedule.interval_days || schedule.interval_days <= 0) return false;
    const anchorStr = schedule.start_date || '2020-01-01'; // Fallback anchor if not set
    const anchorMs = new Date(anchorStr + 'T00:00:00Z').getTime();
    const currentMs = new Date(dateString + 'T00:00:00Z').getTime();
    const diffDays = Math.round((currentMs - anchorMs) / (24 * 60 * 60 * 1000));
    if (diffDays < 0) return false;
    return diffDays % schedule.interval_days === 0;
  }

  if (type === 'monthly') {
    if (!schedule.day_of_month) return false;
    const parts = dateString.split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);

    if (day === schedule.day_of_month) return true;

    // Handle last day of month fallback (e.g. schedule for 31st, but current month only has 30 days)
    if (schedule.day_of_month > day) {
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      if (day === lastDay && schedule.day_of_month >= lastDay) {
        return true;
      }
    }
    return false;
  }

  if (type === 'cyclic') {
    const onDays = schedule.cycle_on_days || 0;
    const offDays = schedule.cycle_off_days || 0;
    if (onDays <= 0) return false;
    const cyclePeriod = onDays + offDays;
    const anchorStr = schedule.start_date || '2020-01-01';
    const anchorMs = new Date(anchorStr + 'T00:00:00Z').getTime();
    const currentMs = new Date(dateString + 'T00:00:00Z').getTime();
    const diffDays = Math.round((currentMs - anchorMs) / (24 * 60 * 60 * 1000));
    if (diffDays < 0) return false;
    const positionInCycle = diffDays % cyclePeriod;
    return positionInCycle < onDays;
  }

  // PRN (as-needed) is handled on-demand, not on a due checklist
  if (type === 'prn') {
    return false;
  }

  // Tapers default to daily behavior unless customized
  if (type === 'taper') {
    return true;
  }

  return false;
}

/**
 * Filters and returns all scheduled dose slots for a given date.
 */
export function getDueDosesForDate(
  medications: Array<{ id: string; is_active: boolean; schedules?: SharedScheduleRule[] } & Record<string, any>>,
  dateString: string
): Array<{
  medication: any;
  schedule: SharedScheduleRule & { id: string };
}> {
  const result: Array<{ medication: any; schedule: SharedScheduleRule & { id: string } }> = [];
  for (const med of medications) {
    if (!med.is_active) continue;
    if (!med.schedules || med.schedules.length === 0) continue;
    for (const sched of med.schedules) {
      if (sched.schedule_type_id === 'prn') {
        // PRN is logged on demand, not scheduled on due list
        continue;
      }
      if (isScheduleDueOnDate(sched, dateString)) {
        result.push({
          medication: med,
          schedule: sched as SharedScheduleRule & { id: string }
        });
      }
    }
  }
  return result;
}

