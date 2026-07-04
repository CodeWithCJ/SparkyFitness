import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addDays,
  compareDays,
  todayInZone,
  isHormonalBc,
  type FlowLevel,
} from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  useCycleSettings,
  useCycleLogs,
  useCycleHistory,
  useBulkUpsertDailyLogMutation,
} from '@/hooks/useCycle';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Edit2, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import DailyLogPanel from './DailyLogPanel';
import CycleIcon from './CycleIcon';

interface CycleCalendarProps {
  /** When provided, the calendar is controlled and shares this date with the
   *  parent (e.g. the Today page's day-navigator). */
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
  /** Hide the built-in selected-day detail panel (the parent renders the log). */
  hideDayDetails?: boolean;
}

export default function CycleCalendar({
  selectedDate: controlledDate,
  onSelectDate,
  hideDayDetails,
}: CycleCalendarProps = {}) {
  const { t } = useTranslation();
  const { timezone, firstDayOfWeek } = usePreferences();
  const today = useMemo(() => todayInZone(timezone), [timezone]);

  // Calendar month state
  const [currentMonth, setCurrentMonth] = useState(() => today.slice(0, 7)); // YYYY-MM
  const [internalDate, setInternalDate] = useState(today);
  const selectedDate = controlledDate ?? internalDate;
  const setSelectedDate = onSelectDate ?? setInternalDate;
  const [editMode, setEditMode] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);

  // Follow the selected day into its month (day-nav arrows crossing a boundary).
  // Month prev/next buttons don't change selectedDate, so browsing is preserved.
  useEffect(() => {
    const month = selectedDate.slice(0, 7);
    setCurrentMonth((prev) => (prev === month ? prev : month));
  }, [selectedDate]);

  // Queries
  const { data: settings } = useCycleSettings();
  const { data: cycles = [] } = useCycleHistory();

  const { year, monthVal } = useMemo(() => {
    const parts = currentMonth.split('-').map(Number);
    return { year: parts[0] ?? 2026, monthVal: parts[1] ?? 7 };
  }, [currentMonth]);

  const { gridStartDate, gridDates } = useMemo(() => {
    const dateObj = new Date(Date.UTC(year, monthVal - 1, 1));
    const startDayOfWeek = dateObj.getUTCDay();
    const offset = (startDayOfWeek - firstDayOfWeek + 7) % 7;
    const gridStart = addDays(
      `${year}-${String(monthVal).padStart(2, '0')}-01`,
      -offset
    );

    const daysInMonth = new Date(Date.UTC(year, monthVal, 0)).getUTCDate();
    const cells = offset + daysInMonth > 35 ? 42 : 35;
    const dates = [];
    for (let i = 0; i < cells; i++) {
      dates.push(addDays(gridStart, i));
    }
    return { gridStartDate: gridStart, gridDates: dates };
  }, [year, monthVal, firstDayOfWeek]);

  // Fetch logs for the current grid range
  const gridEndDate = useMemo(() => {
    return gridDates[gridDates.length - 1] ?? today;
  }, [gridDates, today]);

  const { data: logs = [] } = useCycleLogs(gridStartDate, gridEndDate);
  const bulkUpsert = useBulkUpsertDailyLogMutation();

  // Local painted period days state (only active when editMode is true)
  const [paintedPeriods, setPaintedPeriods] = useState<Record<string, boolean>>(
    {}
  );

  // Initialize paint state with current logged periods
  const handleStartEdit = () => {
    const initial: Record<string, boolean> = {};
    gridDates.forEach((dateStr) => {
      const log = logs.find((l) => l.entry_date === dateStr);
      const isPeriod = log
        ? (log.flow_level && log.flow_level !== 'none') ||
          Object.keys(log.product_usage ?? {}).length > 0
        : false;
      initial[dateStr] = !!isPeriod;
    });
    setPaintedPeriods(initial);
    setEditMode(true);
  };

  const handleToggleDayPaint = (dateStr: string) => {
    setPaintedPeriods((prev) => ({
      ...prev,
      [dateStr]: !prev[dateStr],
    }));
  };

  const handleSavePaint = async () => {
    const changes: Array<{ date: string; flow_level: FlowLevel | null }> = [];
    gridDates.forEach((dateStr) => {
      const log = logs.find((l) => l.entry_date === dateStr);
      const wasPeriod = log
        ? (log.flow_level && log.flow_level !== 'none') ||
          Object.keys(log.product_usage ?? {}).length > 0
        : false;
      const isPeriod = !!paintedPeriods[dateStr];

      if (isPeriod !== wasPeriod) {
        changes.push({
          date: dateStr,
          flow_level: isPeriod ? 'medium' : null,
        });
      }
    });

    if (changes.length > 0) {
      try {
        await bulkUpsert.mutateAsync(changes);
        toast({
          title: t('cycle.calendar.saveSuccess', 'Period updated'),
          description: t(
            'cycle.calendar.saveSuccessDesc',
            'Successfully updated menstrual period logs.'
          ),
        });
      } catch (err) {
        console.error(err);
      }
    }
    setEditMode(false);
  };

  // Month navigation
  const handlePrevMonth = () => {
    if (monthVal === 1) {
      setCurrentMonth(`${year - 1}-12`);
    } else {
      setCurrentMonth(`${year}-${String(monthVal - 1).padStart(2, '0')}`);
    }
  };

  const handleNextMonth = () => {
    if (monthVal === 12) {
      setCurrentMonth(`${year + 1}-01`);
    } else {
      setCurrentMonth(`${year}-${String(monthVal + 1).padStart(2, '0')}`);
    }
  };

  const monthLabel = useMemo(() => {
    if (!year || !monthVal) return '';
    const date = new Date(Date.UTC(year, monthVal - 1, 1));
    return date.toLocaleDateString(t('i18n.locale', 'en-US'), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }, [year, monthVal, t]);

  // Daily details for selectedDate
  const selectedLog = useMemo(() => {
    return logs.find((l) => l.entry_date === selectedDate) ?? null;
  }, [logs, selectedDate]);

  // Compute predictions for selectedDate
  const stats = useMemo(() => {
    const completed = cycles.filter(
      (c) => typeof c.cycle_length === 'number' && c.cycle_length > 0
    );
    const recent = completed.slice(-6);
    const cycleLengths = recent.map((c) => c.cycle_length!);
    const periodLengths = recent.map((c) => c.period_length!).filter(Boolean);
    return {
      avgCycleLength:
        settings?.avg_cycle_length_override ??
        (cycleLengths.length
          ? Math.round(
              cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length
            )
          : 28),
      avgPeriodLength:
        settings?.avg_period_length_override ??
        (periodLengths.length
          ? Math.round(
              periodLengths.reduce((a, b) => a + b, 0) / periodLengths.length
            )
          : 5),
      sampleSize: cycleLengths.length,
    };
  }, [cycles, settings]);

  const predictions = useMemo(() => {
    const lastCycle = cycles[0]; // descending order
    if (!lastCycle || !lastCycle.start_date) return null;

    const suppressFertility =
      settings &&
      (isHormonalBc(settings.birth_control_method) ||
        settings.show_fertile_window === false ||
        settings.mode === 'pregnant' ||
        settings.mode === 'postpartum' ||
        settings.mode === 'menopause');

    const count = 4;
    const predictedCycles = [];
    let currentStart = lastCycle.start_date;
    const luteal = settings?.luteal_phase_length ?? 14;

    for (let i = 0; i < count; i++) {
      const nextStart = addDays(currentStart, stats.avgCycleLength);
      const nextEnd = addDays(nextStart, stats.avgPeriodLength - 1);

      let ovulation: string | null = null;
      let fertileStart: string | null = null;
      let fertileEnd: string | null = null;

      if (!suppressFertility) {
        ovulation = addDays(nextStart, -luteal);
        fertileStart = addDays(ovulation, -5);
        fertileEnd = addDays(ovulation, 1);
      }

      predictedCycles.push({
        periodStart: nextStart,
        periodEnd: nextEnd,
        ovulation,
        fertileStart,
        fertileEnd,
      });

      currentStart = nextStart;
    }

    return { cycles: predictedCycles };
  }, [cycles, stats, settings]);

  // Decoration mapping for grid rendering
  const decoratedDaysMap = useMemo(() => {
    const map: Record<
      string,
      'period' | 'predicted-period' | 'fertile' | 'ovulation' | 'none'
    > = {};

    // 1. Predicted days
    if (predictions && settings?.show_fertile_window !== false) {
      predictions.cycles.forEach((pc) => {
        // Predicted period
        let start = pc.periodStart;
        while (compareDays(start, pc.periodEnd) <= 0) {
          map[start] = 'predicted-period';
          start = addDays(start, 1);
        }
        // Predicted fertile window
        if (pc.fertileStart && pc.fertileEnd) {
          let fStart = pc.fertileStart;
          while (compareDays(fStart, pc.fertileEnd) <= 0) {
            map[fStart] = 'fertile';
            fStart = addDays(fStart, 1);
          }
        }
        // Ovulation day
        if (pc.ovulation) {
          map[pc.ovulation] = 'ovulation';
        }
      });
    }

    // 2. Logged period days override predictions
    logs.forEach((log) => {
      const isPeriod =
        (log.flow_level && log.flow_level !== 'none') ||
        Object.keys(log.product_usage ?? {}).length > 0;
      if (isPeriod) {
        map[log.entry_date] = 'period';
      }
    });

    return map;
  }, [logs, predictions, settings]);

  const weekdayHeaders = useMemo(() => {
    const days = [
      t('cycle.calendar.sun', 'Sun'),
      t('cycle.calendar.mon', 'Mon'),
      t('cycle.calendar.tue', 'Tue'),
      t('cycle.calendar.wed', 'Wed'),
      t('cycle.calendar.thu', 'Thu'),
      t('cycle.calendar.fri', 'Fri'),
      t('cycle.calendar.sat', 'Sat'),
    ];
    const reordered = [];
    for (let i = 0; i < 7; i++) {
      reordered.push(days[(firstDayOfWeek + i) % 7]);
    }
    return reordered;
  }, [firstDayOfWeek, t]);

  return (
    <div className="space-y-4">
      {/* Month Picker Header */}
      <Card>
        <CardContent className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrevMonth}
              disabled={editMode}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-bold text-sm select-none min-w-[120px] text-center">
              {monthLabel}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNextMonth}
              disabled={editMode}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-destructive"
                  onClick={() => setEditMode(false)}
                >
                  <X className="h-4 w-4 mr-1.5" />{' '}
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button
                  size="sm"
                  className="h-8 bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleSavePaint}
                >
                  <Check className="h-4 w-4 mr-1.5" />{' '}
                  {t('common.save', 'Save')}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={handleStartEdit}
              >
                <Edit2 className="h-3.5 w-3.5 mr-1.5" />{' '}
                {t('cycle.calendar.editPeriods', 'Edit Periods')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {editMode && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/10">
          <CardContent className="py-2.5 px-4 text-xs text-amber-700 dark:text-amber-400">
            {t(
              'cycle.calendar.paintModeHint',
              'Tap dates to toggle period flow. Predictions will recompute when saved.'
            )}
          </CardContent>
        </Card>
      )}

      {/* Calendar Grid Card */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground select-none">
            {weekdayHeaders.map((day) => (
              <div key={day} className="py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Grid Cells */}
          <div className="grid grid-cols-7 gap-y-2 gap-x-1">
            {gridDates.map((dateStr) => {
              const dayParts = dateStr.split('-');
              const dayNum = Number(dayParts[2]);
              const isCurrentMonth = Number(dayParts[1]) === monthVal;
              const isSel = compareDays(dateStr, selectedDate) === 0;
              const isTdy = compareDays(dateStr, today) === 0;

              // Types & colors
              const dayType = decoratedDaysMap[dateStr] ?? 'none';
              const isPainted = editMode ? !!paintedPeriods[dateStr] : false;

              let styleClass = 'text-foreground hover:bg-muted/50';
              if (!isCurrentMonth) {
                styleClass = 'text-muted-foreground/40 hover:bg-muted/20';
              }

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => {
                    if (editMode) {
                      handleToggleDayPaint(dateStr);
                    } else {
                      setSelectedDate(dateStr);
                    }
                  }}
                  className={cn(
                    'relative mx-auto flex h-10 w-10 items-center justify-center rounded-full text-xs font-medium transition duration-150 outline-none',
                    styleClass,
                    isSel &&
                      !editMode &&
                      'ring-2 ring-primary ring-offset-2 ring-offset-background',
                    isTdy && 'border-2 border-foreground'
                  )}
                  style={{
                    backgroundColor: editMode
                      ? isPainted
                        ? '#C9524E'
                        : undefined
                      : dayType === 'period'
                        ? '#C9524E'
                        : dayType === 'predicted-period'
                          ? '#C9524E40'
                          : dayType === 'fertile'
                            ? '#A9D3B540'
                            : dayType === 'ovulation'
                              ? '#33684A'
                              : undefined,
                    color: editMode
                      ? isPainted
                        ? '#fff'
                        : undefined
                      : dayType === 'period'
                        ? '#fff'
                        : dayType === 'ovulation'
                          ? '#fff'
                          : undefined,
                    borderStyle:
                      dayType === 'predicted-period' ? 'dashed' : undefined,
                    borderWidth:
                      dayType === 'predicted-period' ? '2px' : undefined,
                    borderColor:
                      dayType === 'predicted-period' ? '#C9524E' : undefined,
                  }}
                >
                  <span>{dayNum}</span>
                  {/* Indicators */}
                  {!editMode &&
                    (logs.find((l) => l.entry_date === dateStr)?.notes ||
                      logs.find((l) => l.entry_date === dateStr)?.bbt) && (
                      <span className="absolute bottom-1 h-1 w-1 rounded-full bg-muted-foreground/60" />
                    )}
                </button>
              );
            })}
          </div>

          {/* Calendar Legends */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2 border-t text-[11px] text-muted-foreground select-none">
            <LegendRow
              color="#C9524E"
              label={t('cycle.legend.period', 'Period')}
            />
            <LegendRow
              color="#C9524E40"
              label={t('cycle.legend.predicted', 'Predicted Period')}
              dashed
            />
            <LegendRow
              color="#A9D3B5"
              label={t('cycle.legend.fertile', 'Fertile Window')}
            />
            <LegendRow
              color="#33684A"
              label={t('cycle.legend.ovulation', 'Ovulation')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Selected Day Details Panel — hidden when the parent renders the log */}
      {!editMode && !hideDayDetails && (
        <Card>
          <CardHeader className="py-3.5 px-4 border-b flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-bold">
                {new Date(selectedDate).toLocaleDateString(
                  t('i18n.locale', 'en-US'),
                  {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  }
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                {decoratedDaysMap[selectedDate] === 'period' &&
                  t('cycle.legend.period', 'Period Day')}
                {decoratedDaysMap[selectedDate] === 'predicted-period' &&
                  t('cycle.legend.predicted', 'Predicted Period')}
                {decoratedDaysMap[selectedDate] === 'fertile' &&
                  t('cycle.legend.fertile', 'Fertile Window')}
                {decoratedDaysMap[selectedDate] === 'ovulation' &&
                  t('cycle.legend.ovulation', 'Predicted Ovulation')}
                {(!decoratedDaysMap[selectedDate] ||
                  decoratedDaysMap[selectedDate] === 'none') &&
                  t('cycle.calendar.normalDay', 'Non-bleeding day')}
              </CardDescription>
            </div>

            {/* Quick edit log dialog */}
            <Dialog open={isLogOpen} onOpenChange={setIsLogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-8">
                  {selectedLog
                    ? t('cycle.calendar.editLog', 'Edit Log')
                    : t('cycle.calendar.addLog', 'Add Log')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
                <DialogTitle>
                  {t('cycle.calendar.logDialogTitle', 'Daily Log - {{date}}', {
                    date: selectedDate,
                  })}
                </DialogTitle>
                <DialogDescription>
                  {t(
                    'cycle.calendar.logDialogDesc',
                    'Log your cycle parameters, symptoms, mood, and temperature.'
                  )}
                </DialogDescription>
                <DailyLogPanel
                  date={selectedDate}
                  log={selectedLog}
                  preferredProducts={
                    settings?.preferred_products ?? ['pad', 'tampon']
                  }
                />
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {selectedLog ? (
              <div className="space-y-2">
                {/* Flow level */}
                {selectedLog.flow_level &&
                  selectedLog.flow_level !== 'none' && (
                    <div className="flex items-center gap-2 text-sm bg-red-50/50 dark:bg-red-950/10 p-2 rounded-lg border border-red-100 dark:border-red-950/20">
                      <CycleIcon
                        id={`flow-${selectedLog.flow_level}`}
                        size={20}
                      />
                      <span className="font-semibold text-xs capitalize">
                        {t('cycle.log.flow', 'Flow')}: {selectedLog.flow_level}
                      </span>
                    </div>
                  )}

                {/* Product usage */}
                {Object.keys(selectedLog.product_usage ?? {}).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {Object.entries(selectedLog.product_usage).map(
                      ([prod, count]) => (
                        <div
                          key={prod}
                          className="flex items-center gap-1.5 bg-muted/40 px-2 py-1 rounded-full text-xs"
                        >
                          <CycleIcon id={`product-${prod}`} size={16} />
                          <span>
                            {prod}: {count}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* BBT */}
                {selectedLog.bbt && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold">
                      {t('cycle.log.bbt', 'Basal Temp')}:
                    </span>{' '}
                    {selectedLog.bbt.toFixed(2)} °C
                  </p>
                )}

                {/* Cervical mucus */}
                {selectedLog.cervical_mucus && (
                  <p className="text-xs text-muted-foreground capitalize">
                    <span className="font-semibold">
                      {t('cycle.log.mucus', 'Mucus')}:
                    </span>{' '}
                    {selectedLog.cervical_mucus}
                  </p>
                )}

                {/* Moods */}
                {selectedLog.moods && selectedLog.moods.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedLog.moods.map((m) => (
                      <span
                        key={m}
                        className="bg-muted px-2 py-0.5 rounded-full text-[10px] capitalize"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                )}

                {/* Energy */}
                {selectedLog.energy && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold">
                      {t('cycle.log.energy', 'Energy')}:
                    </span>{' '}
                    {selectedLog.energy}/5
                  </p>
                )}

                {/* Notes */}
                {selectedLog.notes && (
                  <p className="text-xs bg-muted/20 p-2.5 rounded-lg italic border border-muted">
                    "{selectedLog.notes}"
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic text-center py-4">
                {t('cycle.calendar.noLogs', 'No logs recorded for this day.')}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LegendRow({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-3.5 w-3.5 rounded-full"
        style={{
          backgroundColor: dashed ? undefined : color,
          border: dashed ? `2px dashed ${color}` : undefined,
        }}
      />
      {label}
    </span>
  );
}
