import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useSymptomEntries, useSymptomFreeDays } from '@/hooks/useSymptoms';
import { cn } from '@/lib/utils';
import { scaleMax, symptomEntryDays, todayInZone } from '@workspace/shared';

interface SymptomCalendarProps {
  selectedDate: string;
  onDateChange: (day: string) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Calendar-day arithmetic on plain numbers, so no timezone can shift a date. */
function monthDays(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  return {
    // Monday-first offset: Monday is 0.
    offset: (first.getUTCDay() + 6) % 7,
    count: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  };
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * A month of symptom history. Days you marked symptom-free are green, days an
 * entry covers are tinted by how severe the worst one was (an episode tints
 * every day from its start to its end, or to today while it is still going),
 * and days with neither are left blank because they are unknown, not
 * symptom-free.
 */
export default function SymptomCalendar({
  selectedDate,
  onDateChange,
}: SymptomCalendarProps) {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const today = todayInZone(timezone);
  const [year, setYear] = useState(() => Number(selectedDate.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(selectedDate.slice(5, 7)));
  const { offset, count } = monthDays(year, month);
  const first = `${year}-${pad(month)}-01`;
  const last = `${year}-${pad(month)}-${pad(count)}`;

  const { data: entries = [] } = useSymptomEntries({
    fromDate: first,
    toDate: last,
    overlapping: true,
  });
  const { data: freeDays = [] } = useSymptomFreeDays({
    fromDate: first,
    toDate: last,
  });

  const { worst, free } = useMemo(() => {
    const worstByDay = new Map<string, number>();
    const window = { from: first, to: last, today, timezone };
    for (const e of entries) {
      const ratio =
        e.severity != null
          ? (e.peak_severity ?? e.severity) / Math.max(scaleMax('1-10'), 1)
          : 0.1;
      for (const day of symptomEntryDays(e, window)) {
        worstByDay.set(day, Math.max(worstByDay.get(day) ?? 0, ratio));
      }
    }
    return {
      worst: worstByDay,
      free: new Set(freeDays.map((d) => d.entry_date)),
    };
  }, [entries, freeDays, first, last, today, timezone]);

  const shift = (delta: number) => {
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth() + 1);
  };

  const title = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
    undefined,
    { month: 'long', year: 'numeric', timeZone: 'UTC' }
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="flex gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label={t('symptoms.calendar.previous', 'Previous month')}
            onClick={() => shift(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label={t('symptoms.calendar.next', 'Next month')}
            onClick={() => shift(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-7 gap-1 text-center text-xs tabular-nums">
          {WEEKDAYS.map((d, i) => (
            <span key={i} className="pb-1 text-[11px] text-muted-foreground">
              {d}
            </span>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {Array.from({ length: count }, (_, i) => {
            const day = `${year}-${pad(month)}-${pad(i + 1)}`;
            const ratio = worst.get(day);
            const isFree = free.has(day);
            const tint =
              ratio == null
                ? undefined
                : ratio > 0.67
                  ? 'bg-red-500/35 font-bold'
                  : 'bg-amber-500/25';
            return (
              <button
                key={day}
                type="button"
                onClick={() => onDateChange(day)}
                aria-label={day}
                aria-current={day === selectedDate ? 'date' : undefined}
                className={cn(
                  'grid aspect-square place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isFree &&
                    ratio == null &&
                    'bg-green-500/15 text-green-700 dark:text-green-400',
                  tint && `${tint} text-foreground`,
                  day === selectedDate && 'ring-2 ring-primary'
                )}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-sm bg-green-500/25" />
            {t('symptoms.calendar.free', 'Symptom-free')}
          </span>
          <span className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-sm bg-amber-500/40" />
            {t('symptoms.calendar.mild', 'Mild to moderate')}
          </span>
          <span className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-sm bg-red-500/50" />
            {t('symptoms.calendar.severe', 'Severe')}
          </span>
          <span className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-sm border" />
            {t('symptoms.calendar.unknown', 'No entry')}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
