import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, AlertTriangle } from 'lucide-react';
import type { FertilityDetails } from '@/hooks/useCycle';
import type { CycleStats } from '@workspace/shared';
import { cn } from '@/lib/utils';

interface FertilityCardProps {
  fertility: FertilityDetails;
  stats: CycleStats;
}

const BAND_COLORS: Record<string, string> = {
  peak: 'bg-emerald-500 text-white dark:bg-emerald-600',
  high: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/50',
  medium:
    'bg-emerald-50/50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border-emerald-100/30',
  low: 'bg-muted text-muted-foreground border-transparent',
};

const BASIS_LABELS: Record<string, string> = {
  bbt: 'BBT temperature shift',
  opk: 'OPK LH peak test',
  calendar: 'calendar method predictions',
};

export default function FertilityCard({
  fertility,
  stats,
}: FertilityCardProps) {
  const { t } = useTranslation();
  const { conceptionProbability, ovulationEstimate } = fertility;

  const band = conceptionProbability.band;
  const probPercent = Math.round(conceptionProbability.probability * 100);
  const basis = ovulationEstimate?.basis || 'calendar';
  const ovulationDate = ovulationEstimate?.date;

  const formatDate = (dateStr: string) => {
    const [, m, d] = dateStr.split('-');
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
  };

  const isIrregular = stats.regularity === 'irregular';

  return (
    <Card className="overflow-hidden border-emerald-500/20 shadow-md bg-gradient-to-br from-card to-emerald-50/10 dark:to-emerald-950/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-emerald-500" />
          {t('cycle.ttc.conceptionProbability', 'Conception Probability')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-bold tracking-tight tabular-nums">
            {probPercent}%
          </span>
          <span
            className={cn(
              'px-2.5 py-1 text-xs font-semibold rounded-full border',
              BAND_COLORS[band]
            )}
          >
            {t(`cycle.ttc.band.${band}`, band.toUpperCase())}
          </span>
        </div>

        <p className="text-sm text-foreground/90">
          {ovulationDate ? (
            <>
              {t(
                'cycle.ttc.ovulationEstimateDetail',
                'Ovulation is estimated on '
              )}
              <strong className="font-semibold">
                {formatDate(ovulationDate)}
              </strong>
              {t('cycle.ttc.ovulationEstimateBasis', ' based on ')}
              <span className="font-medium underline decoration-emerald-500/40 decoration-2">
                {BASIS_LABELS[basis]}
              </span>
              .
            </>
          ) : (
            t(
              'cycle.ttc.noOvulationEstimate',
              'No ovulation estimate available yet. Keep logging to predict.'
            )
          )}
        </p>

        {isIrregular && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 text-xs text-amber-800 dark:border-amber-950/30 dark:bg-amber-950/10 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <p className="font-medium">
                {t(
                  'cycle.ttc.irregularCaveatTitle',
                  'Irregular Cycle Detected'
                )}
              </p>
              <p className="mt-0.5 opacity-90">
                {t(
                  'cycle.ttc.irregularCaveatDesc',
                  'Predictions may be less accurate due to cycle variation. Logging daily BBT and OPK tests will provide the most precise fertile window.'
                )}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
