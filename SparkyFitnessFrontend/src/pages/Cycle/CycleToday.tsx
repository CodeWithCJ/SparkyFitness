import { useMemo, useState, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { todayInZone, daysBetween } from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  useCycleOverview,
  useDismissPromptMutation,
  useFertilityQuery,
  useUpsertCycleSettingsMutation,
} from '@/hooks/useCycle';
import DayNavigator from '@/components/DayNavigator';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Lightbulb,
  X,
  Pencil,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import CycleRing from './CycleRing';
import DailyLogPanel from './DailyLogPanel';
import CycleCalendar from './CycleCalendar';
import CycleHistoryList from './CycleHistoryList';
import FertilityCard from './ttc/FertilityCard';
import FertileWindowChart from './ttc/FertileWindowChart';
import TestQuickLog from './ttc/TestQuickLog';
import TwoWeekWait from './ttc/TwoWeekWait';
import BbtStatusCard from './ttc/BbtStatusCard';

const PHASE_LABELS: Record<string, string> = {
  menstrual: 'Menstrual',
  follicular: 'Follicular',
  fertile: 'Fertile window',
  ovulation: 'Ovulation day',
  luteal: 'Luteal',
  unknown: 'Getting started',
};

export default function CycleToday() {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const today = useMemo(() => todayInZone(timezone), [timezone]);
  const [selectedDate, setSelectedDate] = useState(today);
  const { data: overview, isLoading } = useCycleOverview(selectedDate);
  const { data: fertility } = useFertilityQuery(selectedDate);
  const dismiss = useDismissPromptMutation();
  const upsertSettings = useUpsertCycleSettingsMutation();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [localCycleLen, setLocalCycleLen] = useState('');
  const [localPeriodLen, setLocalPeriodLen] = useState('');
  const [showCalculationGuide, setShowCalculationGuide] = useState(false);

  const openSettings = () => {
    if (overview) {
      setLocalCycleLen(
        String(
          overview.settings?.avg_cycle_length_override ??
            overview.stats.avgCycleLength ??
            28
        )
      );
      setLocalPeriodLen(
        String(
          overview.settings?.avg_period_length_override ??
            overview.stats.avgPeriodLength ??
            5
        )
      );
      setIsSettingsOpen(true);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await upsertSettings.mutateAsync({
        avg_cycle_length_override:
          localCycleLen === '' ? null : Number(localCycleLen),
        avg_period_length_override:
          localPeriodLen === '' ? null : Number(localPeriodLen),
      });
      setIsSettingsOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading || !overview) {
    return (
      <div className="space-y-4">
        <div className="h-64 animate-pulse rounded-2xl bg-muted/40" />
        <div className="h-48 animate-pulse rounded-2xl bg-muted/40" />
      </div>
    );
  }

  const { prediction, stats, phase, cycleDay, currentCycleStart, late, log } =
    overview;
  const mode = overview.settings?.mode ?? 'standard';
  const isTtc = mode === 'ttc';
  // BBT confirms ovulation — relevant for cycle tracking + TTC, not pregnancy modes.
  const showBbt = mode === 'standard' || mode === 'ttc';
  const next = prediction.cycles[0];
  const periodLength =
    overview.settings?.avg_period_length_override ?? stats.avgPeriodLength ?? 5;
  const cycleLength =
    overview.settings?.avg_cycle_length_override ?? stats.avgCycleLength ?? 28;

  // Formatted helpers for dynamic calculations guide
  const lastStartFormatted = currentCycleStart
    ? formatShort(currentCycleStart)
    : null;
  const nextStartFormatted = next ? formatShort(next.periodStart) : null;
  const ovulationFormatted = next?.ovulation
    ? formatShort(next.ovulation)
    : null;
  const fertileStartFormatted = next?.fertileStart
    ? formatShort(next.fertileStart)
    : null;
  const fertileEndFormatted = next?.fertileEnd
    ? formatShort(next.fertileEnd)
    : null;
  const lutealPhase = overview.settings?.luteal_phase_length ?? 14;
  const follicularLength = cycleLength - lutealPhase;

  // Convert prediction absolute days into cycle-day offsets for the ring.
  const toOffset = (day: string | null | undefined) =>
    day && currentCycleStart ? daysBetween(currentCycleStart, day) + 1 : null;

  const daysUntilPeriod = next ? daysBetween(today, next.periodStart) : null;

  const centerValue = cycleDay ? String(cycleDay) : '–';
  const centerSub = late.isLate
    ? t('cycle.today.late', '{{n}} days late', { n: late.daysLate })
    : daysUntilPeriod != null && daysUntilPeriod >= 0
      ? t('cycle.today.periodIn', 'Period in {{n}} days', {
          n: daysUntilPeriod,
        })
      : PHASE_LABELS[phase];

  return (
    <div className="space-y-5">
      <DayNavigator
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
      />

      {isTtc && (
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {t('cycle.today.ttcModeActive', 'TTC Mode Active')}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Today's log + Cycle History */}
        <div className="lg:col-span-7 space-y-5">
          {/* Daily log for the selected day */}
          <DailyLogPanel
            date={selectedDate}
            log={log}
            preferredProducts={
              overview.settings?.preferred_products ?? ['pad', 'tampon']
            }
          />

          {/* Cycle history with edit / hide / delete controls */}
          <CycleHistoryList />
        </div>

        {/* Right Column: Calendar, then ring + predictions + averages */}
        <div className="lg:col-span-5 space-y-5">
          {/* Late banner */}
          {late.isLate ? (
            <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="py-3 text-sm">
                {t(
                  'cycle.today.lateBanner',
                  'Your period is {{n}} days late. Log it when it starts, or adjust your cycle length in settings.',
                  { n: late.daysLate }
                )}
              </CardContent>
            </Card>
          ) : null}

          {/* Month calendar — shares the selected day with the navigator above */}
          <CycleCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            hideDayDetails
          />

          {/* Collapsible Calculation Guide */}
          <Card className="border border-muted/50 bg-muted/10">
            <button
              onClick={() => setShowCalculationGuide((prev) => !prev)}
              className="w-full flex items-center justify-between p-4 text-left font-semibold text-sm hover:bg-muted/20 rounded-t-xl transition-colors focus-visible:outline-none"
            >
              <span className="flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" />
                {t(
                  'cycle.today.guide.title',
                  'How are predictions calculated?'
                )}
              </span>
              {showCalculationGuide ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {showCalculationGuide && (
              <CardContent className="p-4 pt-0 text-xs text-muted-foreground space-y-3 border-t border-muted/30">
                <p className="mt-3">
                  {t(
                    'cycle.today.guide.intro',
                    'Predictions are computed dynamically using your cycle settings and logs:'
                  )}
                </p>
                <div className="grid grid-cols-1 gap-3 pt-1">
                  <div className="space-y-1">
                    <h5 className="font-semibold text-foreground text-[11px]">
                      {t('cycle.today.guide.periodTitle', 'Next Period Start')}
                    </h5>
                    <p>
                      {lastStartFormatted && nextStartFormatted ? (
                        <>
                          {t(
                            'cycle.today.guide.periodDescDynamic',
                            'Calculated as:'
                          )}{' '}
                          <span className="font-medium text-foreground">
                            {lastStartFormatted} + {cycleLength}{' '}
                            {t('cycle.today.guide.days', 'days')} ={' '}
                            {nextStartFormatted}
                          </span>
                        </>
                      ) : (
                        t(
                          'cycle.today.guide.periodDesc',
                          'Last Period Start + Typical Cycle Length (e.g., June 12 + 30 days = July 12).'
                        )
                      )}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <h5 className="font-semibold text-foreground text-[11px]">
                      {t('cycle.today.guide.ovulationTitle', 'Ovulation Day')}
                    </h5>
                    <p>
                      {nextStartFormatted && ovulationFormatted ? (
                        <>
                          {t(
                            'cycle.today.guide.ovulationDescDynamic',
                            'Calculated as:'
                          )}{' '}
                          <span className="font-medium text-foreground">
                            {nextStartFormatted} - {lutealPhase}{' '}
                            {t('cycle.today.guide.days', 'days')} ={' '}
                            {ovulationFormatted}
                          </span>
                        </>
                      ) : (
                        t(
                          'cycle.today.guide.ovulationDesc',
                          'Next Period Start - Luteal Phase Length (e.g., July 12 - 14 days = June 28).'
                        )
                      )}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <h5 className="font-semibold text-foreground text-[11px]">
                      {t(
                        'cycle.today.guide.follicularTitle',
                        'Follicular Phase (Variable)'
                      )}
                    </h5>
                    <p>
                      {follicularLength > 0 &&
                      lastStartFormatted &&
                      ovulationFormatted ? (
                        <>
                          {t(
                            'cycle.today.guide.follicularDescDynamic',
                            'Calculated as:'
                          )}{' '}
                          <span className="font-medium text-foreground">
                            {cycleLength} {t('cycle.today.guide.days', 'days')}{' '}
                            - {lutealPhase}{' '}
                            {t('cycle.today.guide.days', 'days')} ={' '}
                            {follicularLength}{' '}
                            {t('cycle.today.guide.days', 'days')}
                          </span>{' '}
                          (from {lastStartFormatted} to {ovulationFormatted}).
                        </>
                      ) : (
                        t(
                          'cycle.today.guide.follicularDesc',
                          'The phase before ovulation. It automatically expands or contracts to fit your total cycle length (e.g., 16 days for a 30-day cycle).'
                        )
                      )}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <h5 className="font-semibold text-foreground text-[11px]">
                      {t('cycle.today.guide.fertileTitle', 'Fertile Window')}
                    </h5>
                    <p>
                      {ovulationFormatted &&
                      fertileStartFormatted &&
                      fertileEndFormatted ? (
                        <>
                          {t(
                            'cycle.today.guide.fertileDescDynamic',
                            'Calculated as:'
                          )}{' '}
                          <span className="font-medium text-foreground">
                            {ovulationFormatted} - 5{' '}
                            {t('cycle.today.guide.days', 'days')} to{' '}
                            {ovulationFormatted} + 1{' '}
                            {t('cycle.today.guide.day', 'day')}
                          </span>{' '}
                          (from {fertileStartFormatted} to {fertileEndFormatted}
                          ).
                        </>
                      ) : (
                        t(
                          'cycle.today.guide.fertileDesc',
                          'The 7-day span from 5 days before ovulation up to 1 day after ovulation, representing the maximum chance of conception.'
                        )
                      )}
                    </p>
                  </div>
                </div>
                <p className="text-[10px] italic pt-2 border-t border-muted/20">
                  {t(
                    'cycle.today.guide.note',
                    'Note: Standard cycles use a 14-day luteal phase. You can adjust your cycle settings using the edit pencil on the Cycle Length card.'
                  )}
                </p>
              </CardContent>
            )}
          </Card>

          {/* Hero ring */}
          <Card>
            <CardContent className="pt-6">
              <CycleRing
                cycleDay={cycleDay}
                cycleLength={cycleLength}
                periodLength={periodLength}
                fertileStartDay={toOffset(next?.fertileStart)}
                fertileEndDay={toOffset(next?.fertileEnd)}
                ovulationDay={toOffset(next?.ovulation)}
                centerLabel={t('cycle.today.cycleDay', 'Cycle day')}
                centerValue={centerValue}
                centerSub={centerSub}
              />
              <div className="mt-2 flex items-center justify-center gap-4 text-xs text-muted-foreground">
                <LegendDot
                  color="#C9524E"
                  label={t('cycle.legend.period', 'Period')}
                />
                <LegendDot
                  color="#A9D3B5"
                  label={t('cycle.legend.fertile', 'Fertile')}
                />
                <LegendDot
                  color="#33684A"
                  label={t('cycle.legend.ovulation', 'Ovulation')}
                />
              </div>
            </CardContent>
          </Card>

          {/* Prediction strip */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label={t('cycle.today.nextPeriod', 'Next period')}
              value={next ? formatShort(next.periodStart) : '—'}
            />
            <StatCard
              label={t('cycle.today.ovulation', 'Ovulation')}
              value={next?.ovulation ? formatShort(next.ovulation) : '—'}
            />
            <StatCard
              label={t('cycle.today.cycleLength', 'Cycle length')}
              value={`${cycleLength}d`}
              action={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground"
                  onClick={openSettings}
                  aria-label="Edit cycle settings"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              }
            />
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label={t('cycle.stats.cycleAvg', 'Cycle avg')}
              value={`${overview.settings?.avg_cycle_length_override ?? stats.avgCycleLength ?? 28}d`}
              sub={
                stats.sampleSize >= 2 ? `±${stats.cycleLengthSd}` : undefined
              }
            />
            <StatCard
              label={t('cycle.stats.periodAvg', 'Period avg')}
              value={`${overview.settings?.avg_period_length_override ?? stats.avgPeriodLength ?? 5}d`}
              sub={
                stats.regularity !== 'unknown'
                  ? t(`cycle.regularity.${stats.regularity}`, stats.regularity)
                  : undefined
              }
            />
            <StatCard
              label={t('cycle.stats.confidence', 'Prediction')}
              value={t(
                `cycle.confidence.${prediction.confidence}`,
                prediction.confidence
              )}
            />
          </div>

          {/* BBT setup / staleness (standard + TTC modes) */}
          {showBbt && fertility && (
            <BbtStatusCard bbtStatus={fertility.bbtStatus} />
          )}

          {/* TTC widgets */}
          {isTtc && fertility && (
            <div className="space-y-5">
              {fertility.dpo !== null && fertility.dpo >= 0 ? (
                <TwoWeekWait
                  dpo={fertility.dpo}
                  currentCycleStart={currentCycleStart}
                />
              ) : (
                <FertilityCard fertility={fertility} stats={stats} />
              )}
              <FertileWindowChart series={fertility.fertileWindowSeries} />
              <TestQuickLog currentCycleStart={currentCycleStart} />
            </div>
          )}

          {/* Insight card */}
          <Card className="bg-primary/5">
            <CardContent className="flex items-start gap-3 py-4">
              <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="flex-1 text-sm">
                {t(
                  `cycle.insight.${overview.insightKey}`,
                  defaultInsight(overview.insightKey)
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label="Dismiss insight"
                onClick={() => dismiss.mutate(`insight:${overview.insightKey}`)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <p className="pb-4 text-center text-xs text-muted-foreground">
        {t(
          'cycle.disclaimer',
          'Predictions are informational and not medical advice or contraception.'
        )}
      </p>

      {/* Inline Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('cycle.today.adjustSettingsTitle', 'Adjust Cycle Lengths')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="inline-avg-cycle">
                {t('cycle.today.avgCycleLabel', 'Typical Cycle Length (days)')}
              </Label>
              <Input
                id="inline-avg-cycle"
                type="number"
                min={15}
                max={90}
                value={localCycleLen}
                onChange={(e) => setLocalCycleLen(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  'cycle.today.avgCycleHint',
                  'Standard is 28 days. Adjust to customize predictions to your body.'
                )}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inline-avg-period">
                {t(
                  'cycle.today.avgPeriodLabel',
                  'Typical Period Length (days)'
                )}
              </Label>
              <Input
                id="inline-avg-period"
                type="number"
                min={1}
                max={15}
                value={localPeriodLen}
                onChange={(e) => setLocalPeriodLen(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSettingsOpen(false)}
              disabled={upsertSettings.isPending}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleSaveSettings}
              disabled={upsertSettings.isPending}
            >
              {upsertSettings.isPending
                ? t('common.saving', 'Saving...')
                : t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  action,
}: {
  label: string;
  value: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="relative">
      <CardContent className="px-3 py-3 text-center">
        <div className="flex items-center justify-center gap-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {action}
        </div>
        <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
        {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

function formatShort(day: string): string {
  const [, m, d] = day.split('-');
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${months[Number(m) - 1]} ${Number(d)}`;
}

function defaultInsight(key: string): string {
  const map: Record<string, string> = {
    menstrual_rest:
      'You are in your menstrual phase — rest and gentle movement can help.',
    menstrual_iron: 'Iron-rich foods can support you during your period.',
    follicular_energy:
      'Energy often rises in the follicular phase — a good week for harder workouts.',
    fertile_window: 'You are in your fertile window.',
    ovulation_peak: 'Ovulation is around now — this is your peak fertile day.',
    luteal_dip:
      'Energy and sleep can dip in the late luteal phase. Be kind to yourself.',
    luteal_pms: 'PMS symptoms can appear now — track how you feel.',
    generic_log: 'Log today to improve your predictions over time.',
  };
  return map[key] ?? map['generic_log']!;
}
