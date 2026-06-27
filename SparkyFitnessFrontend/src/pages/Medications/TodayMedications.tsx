import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  Syringe,
  Pill,
  CheckCircle2,
  X,
  RotateCcw,
  Calendar,
  Trash2,
  Activity,
  Trophy,
  Flame,
} from 'lucide-react';
import { addDays, getDueDosesForDate, dayToUtcRange } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  useCreateMedicationEntryMutation,
  useDeleteMedicationEntryMutation,
} from '@/hooks/useMedications';
import type {
  MedicationDetail,
  MedicationEntry,
  MedicationSchedule,
} from '@/types/medications';
import { MedTypeIcon } from './AddMedicationDialog';
import GlpDailyCheckIn from './GlpDailyCheckIn';

export interface DueDose {
  medication: MedicationDetail;
  schedule: MedicationSchedule & { id: string };
}

export interface TodayMedicationsProps {
  selectedDate: string;
  today: string;
  meds: MedicationDetail[];
  entries: MedicationEntry[];
  recentEntries: MedicationEntry[];
  loadingMeds: boolean;
  loadingEntries: boolean;
}

export default function TodayMedications({
  selectedDate,
  today,
  meds,
  entries,
  recentEntries,
  loadingMeds,
  loadingEntries,
}: TodayMedicationsProps) {
  const { t } = useTranslation();
  const { timezone } = usePreferences();

  // Notes state for logging
  const [logNotes, setLogNotes] = useState<Record<string, string>>({});

  // Mutations
  const createEntryMutation = useCreateMedicationEntryMutation();
  const deleteEntryMutation = useDeleteMedicationEntryMutation();

  const isPending =
    createEntryMutation.isPending || deleteEntryMutation.isPending;

  // Schedules evaluation
  const dueDoses = useMemo(() => {
    if (loadingMeds || meds.length === 0) return [];
    return getDueDosesForDate(meds, selectedDate) as DueDose[];
  }, [meds, selectedDate, loadingMeds]);

  const prnMeds = useMemo(() => {
    return meds.filter((m) => {
      if (!m.is_active) return false;
      // Exclude if it's currently due today to prevent showing it twice
      if (dueDoses.some((d) => d.medication.id === m.id)) return false;
      if (!m.schedules || m.schedules.length === 0) return true;
      return m.schedules.some(
        (s: MedicationSchedule) => s.schedule_type_id === 'prn'
      );
    });
  }, [meds, dueDoses]);

  const completedDosesCount = useMemo(() => {
    return dueDoses.filter((due) =>
      entries.some(
        (e) =>
          e.schedule_id === due.schedule.id &&
          (e.status === 'taken' || e.status === 'skipped')
      )
    ).length;
  }, [dueDoses, entries]);

  const progressPercentage = useMemo(() => {
    return dueDoses.length > 0
      ? Math.round((completedDosesCount / dueDoses.length) * 100)
      : 100;
  }, [completedDosesCount, dueDoses.length]);

  // True 14-day adherence: evaluate each day's scheduled doses vs. what was taken.
  const adherence14 = useMemo(() => {
    let due = 0;
    let taken = 0;
    let perfectDays = 0;
    const days: {
      date: string;
      due: number;
      taken: number;
      prnTaken: number;
      pct: number;
    }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = addDays(selectedDate, -i);
      const dayDue = getDueDosesForDate(meds, d);
      let dayTaken = 0;
      for (const dd of dayDue) {
        const hit = recentEntries.some(
          (e) =>
            e.schedule_id === dd.schedule.id &&
            e.entry_date === d &&
            (e.status === 'taken' || e.status === 'prn_taken')
        );
        if (hit) dayTaken++;
      }
      const dayPrnTaken = recentEntries.filter(
        (e) => e.entry_date === d && e.status === 'prn_taken'
      ).length;
      // Effective completion: scheduled taken + PRN activity (capped at due count)
      const effectiveTaken =
        dayDue.length > 0
          ? Math.min(dayDue.length, dayTaken + dayPrnTaken)
          : dayPrnTaken;
      const effectivePct =
        dayDue.length > 0
          ? Math.round((effectiveTaken / dayDue.length) * 100)
          : dayPrnTaken > 0
            ? 100
            : -1;
      days.push({
        date: d,
        due: dayDue.length,
        taken: dayTaken,
        prnTaken: dayPrnTaken,
        pct: effectivePct,
      });
      if (dayDue.length > 0) {
        due += dayDue.length;
        taken += effectiveTaken;
        if (effectiveTaken >= dayDue.length) perfectDays++;
      } else if (dayPrnTaken > 0) {
        // PRN-only day with activity counts as a perfect day
        due += 1;
        taken += 1;
        perfectDays++;
      }
    }
    // Current streak of perfect days (walk back from newest).
    let streak = 0;
    let startIndex = days.length - 1;
    const todayDay = days[startIndex];
    if (todayDay) {
      const todayHasSkips = recentEntries.some(
        (e) => e.entry_date === todayDay.date && e.status === 'skipped'
      );
      const todayIsComplete =
        todayDay.due > 0
          ? todayDay.taken === todayDay.due
          : todayDay.prnTaken > 0;

      if (!todayIsComplete && !todayHasSkips) {
        startIndex = days.length - 2; // start from yesterday
      }
    }

    for (let k = startIndex; k >= 0; k--) {
      const day = days[k];
      if (!day) continue;

      const hasSkips = recentEntries.some(
        (e) => e.entry_date === day.date && e.status === 'skipped'
      );

      if (day.due > 0) {
        if (day.taken === day.due && !hasSkips) {
          streak++;
        } else {
          break;
        }
      } else if (day.prnTaken > 0) {
        if (!hasSkips) {
          streak++;
        } else {
          break;
        }
      }
    }
    return {
      due,
      taken,
      perfectDays,
      days,
      streak,
      pct: due > 0 ? Math.round((taken / due) * 100) : 100,
    };
  }, [meds, selectedDate, recentEntries]);

  // The next GLP-1 dose due today (if any), for the next-injection banner.
  const nextGlpDue = useMemo(() => {
    return (
      dueDoses.find((d) => {
        if (!d.medication.is_glp1) return false;
        // Check if already logged on the selected date to hide the due banner once taken/skipped
        const isLogged = entries.some(
          (e) =>
            e.schedule_id === d.schedule.id &&
            (e.status === 'taken' || e.status === 'skipped')
        );
        return !isLogged;
      }) ?? null
    );
  }, [dueDoses, entries]);

  const handleLogScheduled = (
    due: DueDose,
    status: 'taken' | 'skipped' | 'snoozed'
  ) => {
    let scheduledFor = null;
    if (due.schedule.time_of_day) {
      try {
        const { start } = dayToUtcRange(selectedDate, timezone);
        const [h, m] = due.schedule.time_of_day.split(':');
        scheduledFor = new Date(
          start.getTime() +
            parseInt(h || '0', 10) * 3600000 +
            parseInt(m || '0', 10) * 60000
        ).toISOString();
      } catch (e) {
        console.error(e);
      }
    }

    const notesVal = logNotes[due.schedule.id]?.trim() || null;
    createEntryMutation.mutate(
      {
        medication_id: due.medication.id,
        schedule_id: due.schedule.id,
        status,
        taken_at:
          selectedDate === today
            ? new Date().toISOString()
            : `${selectedDate}T12:00:00.000Z`,
        scheduled_for: scheduledFor,
        entry_date: selectedDate,
        notes: notesVal,
      },
      {
        onSuccess: () => {
          setLogNotes((prev) => {
            const copy = { ...prev };
            delete copy[due.schedule.id];
            return copy;
          });
        },
      }
    );
  };

  const handleLogPrn = (med: MedicationDetail) => {
    const prnSched = med.schedules?.find((s) => s.schedule_type_id === 'prn');
    const schedId = prnSched?.id || med.id;
    const notesVal = logNotes[schedId]?.trim() || null;

    createEntryMutation.mutate(
      {
        medication_id: med.id,
        schedule_id: prnSched?.id || null,
        status: 'prn_taken',
        taken_at:
          selectedDate === today
            ? new Date().toISOString()
            : `${selectedDate}T12:00:00.000Z`,
        entry_date: selectedDate,
        notes: notesVal,
      },
      {
        onSuccess: () => {
          setLogNotes((prev) => {
            const copy = { ...prev };
            delete copy[schedId];
            return copy;
          });
        },
      }
    );
  };

  const handleUndoEntry = (entryId: string) => {
    deleteEntryMutation.mutate(entryId);
  };

  const formatEntryTime = (timestamp: string) => {
    try {
      const parts = Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).formatToParts(new Date(timestamp));

      let hour = '';
      let minute = '';
      let dayPeriod = '';
      for (const p of parts) {
        if (p.type === 'hour') hour = p.value;
        if (p.type === 'minute') minute = p.value;
        if (p.type === 'dayPeriod') dayPeriod = p.value;
      }
      return `${hour}:${minute} ${dayPeriod}`;
    } catch (e) {
      return '--:--';
    }
  };

  const ringColor = useMemo(() => {
    return adherence14.pct >= 90
      ? '#22c55e'
      : adherence14.pct >= 70
        ? '#f59e0b'
        : '#ef4444';
  }, [adherence14.pct]);

  const tiles = useMemo(() => {
    return [
      {
        label:
          selectedDate === today
            ? t('medications.today.dosesToday', 'Doses today')
            : t('medications.today.doses', 'Doses'),
        value: `${completedDosesCount}/${dueDoses.length}`,
        Icon: Pill,
        grad: 'from-emerald-50 to-white dark:from-emerald-950/40 dark:to-transparent',
        chip: 'bg-emerald-100 dark:bg-emerald-900/50',
        num: 'text-emerald-600 dark:text-emerald-400',
      },
      {
        label: t('medications.today.adherence14', '14-day adherence'),
        value: `${adherence14.pct}%`,
        Icon: CheckCircle2,
        grad: 'from-blue-50 to-white dark:from-blue-950/40 dark:to-transparent',
        chip: 'bg-blue-100 dark:bg-blue-900/50',
        num: 'text-blue-600 dark:text-blue-400',
      },
      {
        label: t('medications.today.perfectDays', 'Perfect days (14d)'),
        value: String(adherence14.perfectDays),
        Icon: Trophy,
        grad: 'from-amber-50 to-white dark:from-amber-950/40 dark:to-transparent',
        chip: 'bg-amber-100 dark:bg-amber-900/50',
        num: 'text-amber-600 dark:text-amber-400',
      },
    ];
  }, [
    selectedDate,
    today,
    completedDosesCount,
    dueDoses.length,
    adherence14.pct,
    adherence14.perfectDays,
    t,
  ]);

  return (
    <div className="space-y-6">
      {/* Next GLP-1 injection banner */}
      {nextGlpDue && (
        <Card className="border-blue-500/30 bg-blue-50/40 dark:bg-blue-950/20">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <Syringe className="h-5 w-5 text-blue-500" />
              <div>
                <p className="font-semibold">
                  {nextGlpDue.medication.display_name ||
                    nextGlpDue.medication.name}{' '}
                  injection —{' '}
                  {selectedDate === today ? 'due today' : 'scheduled'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {nextGlpDue.schedule.time_of_day
                    ? `Scheduled ${nextGlpDue.schedule.time_of_day.substring(0, 5)}`
                    : selectedDate === today
                      ? 'Any time today'
                      : 'Any time'}
                </p>
              </div>
            </div>
            {!entries.some(
              (e) =>
                e.schedule_id === nextGlpDue.schedule.id &&
                (e.status === 'taken' || e.status === 'skipped')
            ) && (
              <Button
                size="sm"
                className="bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => handleLogScheduled(nextGlpDue, 'taken')}
                disabled={isPending}
              >
                Log shot
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Today stats + 14-day adherence ring */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50">
              <Activity className="h-3.5 w-3.5 text-indigo-500" />
            </span>
            {t('medications.today.adherenceTitle', 'Adherence overview')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-between">
            <div className="grid w-full grid-cols-3 gap-3">
              {tiles.map((tile) => (
                <div
                  key={tile.label}
                  className={`rounded-xl border bg-gradient-to-br ${tile.grad} p-3`}
                >
                  <div
                    className={`mb-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full ${tile.chip}`}
                  >
                    <tile.Icon className="h-4.5 w-4.5" />
                  </div>
                  <p
                    className={`text-2xl font-bold leading-none tabular-nums ${tile.num}`}
                  >
                    {tile.value}
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                    {tile.label}
                  </p>
                </div>
              ))}
            </div>
            <div className="relative h-24 w-24 shrink-0">
              <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                <circle
                  cx="18"
                  cy="18"
                  r="15.9155"
                  fill="none"
                  className="stroke-muted"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.9155"
                  fill="none"
                  stroke={ringColor}
                  strokeWidth="3"
                  strokeDasharray={`${adherence14.pct}, 100`}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dasharray 0.6s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className="text-lg font-bold tabular-nums"
                  style={{ color: ringColor }}
                >
                  {adherence14.pct}%
                </span>
                <span className="text-[9px] text-muted-foreground">14-day</span>
              </div>
            </div>
          </div>

          {/* 14-day adherence strip + streak */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{t('medications.today.last14', 'Last 14 days')}</span>
              {adherence14.streak > 0 && (
                <span className="flex items-center gap-1 font-semibold text-orange-500">
                  <Flame className="h-3.5 w-3.5 fill-orange-500/20" />{' '}
                  {t('medications.today.streak', '{{count}}-day streak', {
                    count: adherence14.streak,
                  })}
                </span>
              )}
            </div>
            <div className="flex h-10 items-end gap-1">
              {adherence14.days.map((d, i) => {
                const noScheduled = d.due === 0;
                const hasPrn = d.prnTaken > 0;
                const idle = noScheduled && !hasPrn;

                // d.pct already includes PRN contribution
                const color = idle
                  ? 'bg-muted'
                  : d.pct === 100
                    ? 'bg-green-500'
                    : d.pct >= 50
                      ? 'bg-amber-500'
                      : d.pct > 0
                        ? 'bg-orange-500'
                        : 'bg-red-500';

                const tooltip = noScheduled
                  ? hasPrn
                    ? `${d.date}: ${d.prnTaken} PRN dose${d.prnTaken > 1 ? 's' : ''}`
                    : `${d.date}: no doses`
                  : `${d.date}: ${d.taken}/${d.due} taken${d.prnTaken > 0 ? ` + ${d.prnTaken} PRN` : ''}`;

                const height = idle
                  ? 18
                  : noScheduled && hasPrn
                    ? Math.min(100, 40 + d.prnTaken * 20)
                    : Math.max(14, d.pct);

                return (
                  <div
                    key={i}
                    title={tooltip}
                    className={`flex-1 rounded-sm transition-all hover:opacity-80 ${color} ${idle ? 'opacity-40' : ''}`}
                    style={{
                      height: `${height}%`,
                    }}
                  />
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress Banner */}
      <Card className="bg-gradient-to-r from-blue-500/10 to-teal-500/10 border border-blue-500/20 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-500" />{' '}
              {selectedDate === today
                ? t('medications.today.checklistToday', "Today's Checklist")
                : t('medications.today.checklistMed', 'Medication Checklist')}
            </CardTitle>
            <CardDescription className="mt-1">
              {dueDoses.length === 0
                ? `No scheduled doses for ${selectedDate === today ? 'today' : 'this day'}.`
                : `${completedDosesCount} of ${dueDoses.length} doses logged ${selectedDate === today ? 'today' : 'for this day'}.`}
            </CardDescription>
          </div>
          {dueDoses.length > 0 && (
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="w-full bg-muted rounded-full h-2.5 max-w-[200px] overflow-hidden">
                <div
                  className="bg-blue-500 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
              <span className="text-sm font-semibold">
                {progressPercentage}%
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {meds.some((m) => m.is_glp1) && (
        <GlpDailyCheckIn selectedDate={selectedDate} />
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_350px]">
        {/* Scheduled & PRN Column */}
        <div className="space-y-6">
          {/* Today's Medications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50">
                  <Pill className="h-3.5 w-3.5 text-blue-500" />
                </span>
                Today's medications
              </CardTitle>
              <CardDescription>
                Track scheduled doses and log as-needed medications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Due Today Group */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                  <Clock className="h-3.5 w-3.5" /> Due today
                </h3>

                {loadingMeds && (
                  <p className="text-sm text-muted-foreground">
                    Loading checklist…
                  </p>
                )}
                {!loadingMeds && dueDoses.length === 0 && (
                  <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg border border-dashed text-center">
                    No scheduled doses today — log any medication as-needed
                    below.
                  </div>
                )}
                {!loadingMeds &&
                  dueDoses.map((due, idx) => {
                    const entry = entries.find(
                      (e) => e.schedule_id === due.schedule.id
                    );
                    const isLogged =
                      entry &&
                      (entry.status === 'taken' || entry.status === 'skipped');
                    const isSnoozed = entry && entry.status === 'snoozed';

                    return (
                      <div
                        key={`${due.medication.id}-${due.schedule.id}-${idx}`}
                        className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 border rounded-lg transition-all ${
                          isLogged
                            ? 'bg-muted/30 border-muted text-muted-foreground'
                            : isSnoozed
                              ? 'border-amber-200 bg-amber-50/20'
                              : 'bg-card border-border hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 shrink-0">
                            {isLogged && entry.status === 'taken' ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            ) : isLogged && entry.status === 'skipped' ? (
                              <X className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <MedTypeIcon
                                typeId={due.medication.type_id}
                                isGlp1={due.medication.is_glp1}
                                className="h-5 w-5"
                              />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p
                                className={`font-semibold text-sm ${isLogged ? 'line-through' : ''}`}
                              >
                                {due.medication.display_name ||
                                  due.medication.name}
                              </p>
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1.5 py-0 border-blue-200 text-blue-700 bg-blue-50/50 dark:border-blue-900 dark:text-blue-300 dark:bg-blue-950/30"
                              >
                                {t('medications.today.scheduled', 'Scheduled')}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground mt-0.5">
                              <span>
                                {due.schedule.dose_amount ||
                                  due.medication.strength_value}{' '}
                                {due.schedule.dose_amount
                                  ? due.medication.type_id
                                  : due.medication.strength_unit}
                              </span>
                              <span>•</span>
                              <span className="flex items-center gap-1 font-medium text-primary">
                                <Clock className="h-3 w-3" />
                                {due.schedule.time_of_day
                                  ? due.schedule.time_of_day.substring(0, 5)
                                  : t(
                                      'medications.schedule.anyTime',
                                      'Any time'
                                    )}
                              </span>
                            </div>
                            {!isLogged && (
                              <Input
                                placeholder="Add note..."
                                value={logNotes[due.schedule.id] || ''}
                                onChange={(e) =>
                                  setLogNotes((prev) => ({
                                    ...prev,
                                    [due.schedule.id]: e.target.value,
                                  }))
                                }
                                className="h-7 text-xs mt-2 max-w-[200px]"
                              />
                            )}
                            {isLogged && entry?.notes && (
                              <p className="text-xs text-muted-foreground italic mt-1.5">
                                Note: {entry.notes}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 mt-3 sm:mt-0 shrink-0">
                          {isLogged && entry ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs hover:bg-destructive/10 hover:text-destructive flex items-center gap-1"
                              onClick={() => handleUndoEntry(entry.id)}
                              disabled={isPending}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />{' '}
                              {t('medications.today.undo', 'Undo')}
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs text-amber-600 border-amber-200 hover:bg-amber-50"
                                onClick={() =>
                                  handleLogScheduled(due, 'snoozed')
                                }
                                disabled={isPending || isSnoozed}
                              >
                                {isSnoozed
                                  ? t('medications.today.snoozed', 'Snoozed')
                                  : t('medications.today.snooze', 'Snooze')}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs text-muted-foreground hover:bg-muted"
                                onClick={() =>
                                  handleLogScheduled(due, 'skipped')
                                }
                                disabled={isPending}
                              >
                                {t('medications.today.skip', 'Skip')}
                              </Button>
                              <Button
                                size="sm"
                                className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => handleLogScheduled(due, 'taken')}
                                disabled={isPending}
                              >
                                {t('medications.today.take', 'Take')}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* As Needed Group */}
              <div className="space-y-3 pt-4 border-t border-border">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                    <Pill className="h-3.5 w-3.5" /> As needed
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tap to log a dose now (no fixed schedule or not due today).
                  </p>
                </div>

                {loadingMeds && (
                  <p className="text-sm text-muted-foreground">
                    Loading active medications…
                  </p>
                )}
                {!loadingMeds && prnMeds.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2 text-center bg-muted/10 rounded-lg border border-dashed">
                    No as-needed or non-scheduled medications configured.
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {prnMeds.map((med) => {
                    const prnSched = med.schedules?.find(
                      (s) => s.schedule_type_id === 'prn'
                    );
                    const schedId = prnSched?.id || med.id;
                    return (
                      <div
                        key={med.id}
                        className="flex flex-col p-3 border rounded-lg bg-card border-border hover:shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <MedTypeIcon
                              typeId={med.type_id}
                              isGlp1={med.is_glp1}
                              className="h-4.5 w-4.5 shrink-0"
                            />
                            <div className="text-left truncate">
                              <p className="font-semibold text-xs truncate">
                                {med.display_name || med.name}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {med.strength_value
                                  ? `${med.strength_value} ${med.strength_unit ?? ''}`
                                  : med.type_id}
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1.5 py-0 bg-purple-100 text-purple-700 hover:bg-purple-100 dark:bg-purple-950 dark:text-purple-300 dark:hover:bg-purple-950 shrink-0"
                          >
                            PRN
                          </Badge>
                        </div>
                        <Input
                          placeholder="Add note..."
                          value={logNotes[schedId] || ''}
                          onChange={(e) =>
                            setLogNotes((prev) => ({
                              ...prev,
                              [schedId]: e.target.value,
                            }))
                          }
                          className="h-7 text-xs mt-2"
                        />
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white mt-2 w-full"
                          onClick={() => handleLogPrn(med)}
                          disabled={isPending}
                        >
                          Log Intake
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Today Activity Log Column */}
        <div>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                </span>
                Logged today
              </CardTitle>
              <CardDescription>
                Everything you've taken or skipped on this date.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingEntries && (
                <p className="text-sm text-muted-foreground">
                  Loading history…
                </p>
              )}
              {!loadingEntries && entries.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {t(
                    'medications.today.noIntake',
                    'No entries logged yet today.'
                  )}
                </div>
              )}
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/10 text-sm"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MedTypeIcon
                      typeId={
                        meds.find((m) => m.id === entry.medication_id)?.type_id
                      }
                      isGlp1={
                        meds.find((m) => m.id === entry.medication_id)?.is_glp1
                      }
                      className="h-4 w-4 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {entry.med_name_snapshot}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <span className="tabular-nums font-medium">
                          {formatEntryTime(entry.taken_at)}
                        </span>
                        <span>•</span>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 py-0 border-none font-semibold ${
                            entry.status === 'taken'
                              ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                              : entry.status === 'prn_taken'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                : entry.status === 'snoozed'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-850 dark:text-gray-300'
                          }`}
                        >
                          {entry.status === 'taken'
                            ? 'Taken'
                            : entry.status === 'prn_taken'
                              ? 'PRN Taken'
                              : entry.status === 'snoozed'
                                ? 'Snoozed'
                                : 'Skipped'}
                        </Badge>
                      </div>
                      {entry.notes && (
                        <p className="text-[11px] text-muted-foreground italic mt-1">
                          Note: {entry.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleUndoEntry(entry.id)}
                    disabled={isPending}
                    aria-label="Remove entry"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
