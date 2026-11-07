import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useExerciseActivities } from '@/hooks/Reports/useExerciseStats';
import ActivityReportVisualizer from '@/pages/Reports/ActivityReportVisualizer';
import { addDays, cardioSessionHeadline, daysBetween } from '@workspace/shared';
import type { ExerciseActivityQueryItem } from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import { energyFromKcal, type EnergyUnit } from '@workspace/shared';

interface CardioSessionListProps {
  startDate: string | null;
  endDate: string | null;
  unitSystem: 'metric' | 'imperial';
  formatDate: (date: Date, formatStr: string) => string;
  parseISO: (dateString: string) => Date;
}

function dayLabel(
  entryDate: string,
  formatDate: CardioSessionListProps['formatDate'],
  parseISO: CardioSessionListProps['parseISO'],
  todayWord: string,
  yesterdayWord: string
): string {
  const date = parseISO(entryDate);
  const today = formatDate(new Date(), 'yyyy-MM-dd');
  const key = formatDate(date, 'yyyy-MM-dd');
  if (key === today) return todayWord;
  if (key === addDays(today, -1)) return yesterdayWord;
  const ageDays = daysBetween(key, today);
  if (ageDays > 0 && ageDays < 7) return formatDate(date, 'EEEE');
  return formatDate(date, 'MMM d');
}

function headline(
  item: ExerciseActivityQueryItem,
  distanceUnit: string,
  energyUnit: EnergyUnit
): { value: string; unit: string } {
  const stat = cardioSessionHeadline(item);
  if (stat.kind === 'distance') {
    return {
      value: stat.value >= 10 ? stat.value.toFixed(1) : stat.value.toFixed(2),
      unit: distanceUnit === 'miles' ? 'MI' : 'KM',
    };
  }
  if (stat.kind === 'calories') {
    return {
      value: String(Math.round(energyFromKcal(stat.value, energyUnit))),
      unit: energyUnit === 'kJ' ? 'KJ' : 'KCAL',
    };
  }
  return { value: String(stat.value), unit: 'MIN' };
}

export const CardioSessionList = ({
  startDate,
  endDate,
  unitSystem,
  formatDate,
  parseISO,
}: CardioSessionListProps) => {
  const { t } = useTranslation();
  const { activeUserId } = useActiveUser();
  const { energyUnit } = usePreferences();
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [earlier, setEarlier] = useState<ExerciseActivityQueryItem[]>([]);
  // Older pages belong to one account and date range. Drop them the moment
  // either changes, so another selection's sessions are never shown or merged
  // in, even by a parent that does not remount this list.
  const selection = `${activeUserId ?? ''}|${startDate ?? ''}|${endDate ?? ''}|${unitSystem}`;
  const [loadedFor, setLoadedFor] = useState(selection);
  if (loadedFor !== selection) {
    setLoadedFor(selection);
    setPage(1);
    setEarlier([]);
    setOpenId(null);
  }
  // Closing the session above the tap shortens the list, so the row jumps
  // up and the page looks like it scrolled down. Put the row back.
  const stickRow = useRef<{ el: HTMLElement; top: number } | null>(null);
  useLayoutEffect(() => {
    const stuck = stickRow.current;
    if (!stuck) return;
    stickRow.current = null;
    const delta = stuck.el.getBoundingClientRect().top - stuck.top;
    if (Math.abs(delta) > 1) window.scrollBy(0, delta);
  }, [openId]);
  const { data, isLoading } = useExerciseActivities(
    startDate,
    endDate,
    activeUserId ?? undefined,
    unitSystem,
    page
  );
  const items =
    page === 1
      ? (data?.items ?? [])
      : data?.page === page
        ? [...earlier, ...data.items]
        : earlier;
  const distanceUnit = unitSystem === 'imperial' ? 'miles' : 'km';

  const groups: { label: string; items: ExerciseActivityQueryItem[] }[] = [];
  for (const item of items) {
    const label = formatDate(parseISO(item.entryDate), 'MMMM yyyy');
    const last = groups[groups.length - 1];
    if (!last || last.label !== label) {
      groups.push({ label, items: [item] });
    } else {
      last.items.push(item);
    }
  }

  return (
    <div className="space-y-4 [overflow-anchor:none]">
      <div>
        <h2 className="text-lg font-semibold">
          {t('exerciseAnalytics.cardio.sessionsTitle', 'Sessions')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t(
            'exerciseAnalytics.cardio.sessionsHint',
            'Tap a workout for its route and heart rate.'
          )}
        </p>
      </div>
      {isLoading && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('exerciseReportsDashboard.loadingExerciseData', 'Loading...')}
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t(
            'exerciseAnalytics.cardio.noSessions',
            'No cardio workouts in this date range.'
          )}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.label} className="space-y-2">
            <h3 className="text-sm font-semibold">{group.label}</h3>
            {group.items.map((item) => {
              const open = openId === item.id;
              const stat = headline(item, distanceUnit, energyUnit);
              return (
                <div key={item.id} className="rounded-xl border bg-card">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    aria-expanded={open}
                    onClick={(event) => {
                      stickRow.current = {
                        el: event.currentTarget,
                        top: event.currentTarget.getBoundingClientRect().top,
                      };
                      setOpenId(open ? null : item.id);
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm">
                        {item.exerciseName}
                      </span>
                      <span className="block text-lg font-semibold leading-tight text-emerald-400">
                        {stat.value}
                        <span className="ml-1 text-sm">{stat.unit}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {dayLabel(
                        item.entryDate,
                        formatDate,
                        parseISO,
                        t('muscleGroupRecovery.today', 'Today'),
                        t('muscleGroupRecovery.yesterday', 'Yesterday')
                      )}
                    </span>
                  </button>
                  {open && (
                    <div className="border-t px-3 py-3">
                      <ActivityReportVisualizer
                        exerciseEntryId={item.id}
                        providerName={item.source || 'garmin'}
                        variant="outdoor"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))
      )}
      {data && data.page < data.totalPages && (
        <button
          type="button"
          className="w-full rounded-md border px-3 py-2 text-xs font-medium text-muted-foreground"
          onClick={() => {
            if (!data || data.page !== page) return;
            setEarlier((current) => [...current, ...data.items]);
            setPage(page + 1);
          }}
        >
          {t('exerciseAnalytics.cardio.moreSessions', 'Older sessions')}
        </button>
      )}
    </div>
  );
};
