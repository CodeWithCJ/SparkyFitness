import { useTranslation } from 'react-i18next';
import { useCycleCorrelations } from '@/hooks/useCycle';
import type { CorrelationResult, ConditionFlag } from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, TrendingUp, Info } from 'lucide-react';

const METRIC_LABELS: Record<string, string> = {
  weight: 'Weight',
  mood: 'Mood',
  sleep: 'Sleep',
  energy: 'Energy',
};

const METRIC_UNITS: Record<string, string> = {
  weight: 'kg',
  mood: '',
  sleep: 'h',
  energy: '',
};

const PHASE_LABELS: Record<string, string> = {
  menstrual: 'menstrual',
  follicular: 'follicular',
  fertile: 'fertile',
  ovulation: 'ovulation',
  luteal: 'luteal',
};

const CONDITION_LABELS: Record<string, string> = {
  long_cycles:
    'Your cycles average over 35 days. This pattern is sometimes associated with PCOS — worth discussing with a clinician.',
  irregular_cycles:
    'Your cycles vary quite a bit. Tracking a few more will sharpen your picture; consider mentioning it to a clinician.',
  short_cycles:
    'Your cycles are shorter than typical. If this is new, it may be worth a clinician’s input.',
};

function CorrelationCard({ c }: { c: CorrelationResult }) {
  const { t } = useTranslation();
  if (!c.hasEnoughData) return null;
  const label = t(
    `cycle.metric.${c.metric}`,
    METRIC_LABELS[c.metric] ?? c.metric
  );
  const unit = METRIC_UNITS[c.metric] ?? '';
  const max = Math.max(...c.byPhase.map((p) => p.mean), 1);

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <TrendingUp className="h-4 w-4" />
          {label} {t('cycle.correlation.byPhase', 'by cycle phase')}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-1.5">
        {c.byPhase.map((p) => (
          <div key={p.phase} className="flex items-center gap-2 text-xs">
            <span className="w-16 shrink-0 text-muted-foreground">
              {t(`cycle.phase.${p.phase}`, PHASE_LABELS[p.phase] ?? p.phase)}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/50">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{
                  width: `${p.count ? Math.round((p.mean / max) * 100) : 0}%`,
                }}
              />
            </div>
            <span className="w-12 shrink-0 text-right tabular-nums">
              {p.count ? `${p.mean}${unit}` : '—'}
            </span>
          </div>
        ))}
        {c.peakPhase ? (
          <p className="pt-1 text-xs text-muted-foreground">
            {t(
              'cycle.correlation.insight',
              '{{metric}} tends to be {{dir}} in your {{phase}} phase ({{delta}}{{unit}} vs your average).',
              {
                metric: label,
                dir:
                  c.peakDelta > 0
                    ? t('cycle.correlation.higher', 'higher')
                    : t('cycle.correlation.lower', 'lower'),
                phase: t(
                  `cycle.phase.${c.peakPhase}`,
                  PHASE_LABELS[c.peakPhase] ?? c.peakPhase
                ),
                delta: c.peakDelta > 0 ? `+${c.peakDelta}` : c.peakDelta,
                unit,
              }
            )}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function CorrelationCards() {
  const { t } = useTranslation();
  const { data } = useCycleCorrelations();
  if (!data) return null;

  const usable = data.correlations.filter((c) => c.hasEnoughData);
  const flags: ConditionFlag[] = data.conditionFlags ?? [];

  if (usable.length === 0 && flags.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          <Activity className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">
            {t(
              'cycle.correlation.emptyTitle',
              'Correlations unlock with more data'
            )}
          </p>
          <p className="max-w-xs text-xs text-muted-foreground">
            {t(
              'cycle.correlation.emptyDesc',
              'Keep logging weight, mood, sleep and energy across a few cycles to see how they move with your phases.'
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {flags.map((f) => (
        <Card
          key={f.key}
          className="border-amber-200 bg-amber-50/60 dark:border-amber-950/30 dark:bg-amber-950/10"
        >
          <CardContent className="flex items-start gap-2 py-3 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              {t(`cycle.condition.${f.key}`, CONDITION_LABELS[f.key] ?? '')}
            </span>
          </CardContent>
        </Card>
      ))}
      {usable.map((c) => (
        <CorrelationCard key={c.metric} c={c} />
      ))}
    </div>
  );
}
