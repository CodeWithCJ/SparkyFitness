import { differenceInCalendarDays } from 'date-fns';

export function formatIntegrationDate(date: Date, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(
    date
  );
}

export function formatIntegrationDateTime(
  date: Date,
  language: string
): string {
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function getInclusiveCalendarDays(start: Date, end: Date): number {
  return differenceInCalendarDays(end, start) + 1;
}

export function isSyncRangeWithinLimit(
  start: Date,
  end: Date,
  maxDays: number
): boolean {
  const days = getInclusiveCalendarDays(start, end);
  return days >= 1 && days <= maxDays;
}
