import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber, formatWeight } from '@/utils/numberFormatting';
import {
  summarizeStrengthBalance,
  type KeyLift,
  type StrengthRatioResult,
  type StrengthSummaryResponse,
} from '@workspace/shared';

interface StrengthBalanceCardProps {
  summary: StrengthSummaryResponse;
  weightUnit: string;
}

function liftLabel(t: TFunction, lift: KeyLift): string {
  switch (lift) {
    case 'squat':
      return t('strengthBalance.lifts.squat', 'Squat');
    case 'bench':
      return t('strengthBalance.lifts.bench', 'Bench press');
    case 'deadlift':
      return t('strengthBalance.lifts.deadlift', 'Deadlift');
    case 'overhead_press':
      return t('strengthBalance.lifts.overheadPress', 'Overhead press');
    case 'row':
      return t('strengthBalance.lifts.row', 'Row');
  }
}

function statusLabel(
  t: TFunction,
  status: StrengthRatioResult['status']
): string {
  switch (status) {
    case 'low':
      return t('strengthBalance.status.low', 'Below range');
    case 'high':
      return t('strengthBalance.status.high', 'Above range');
    case 'balanced':
      return t('strengthBalance.status.balanced', 'Balanced');
  }
}

const STATUS_CLASS: Record<StrengthRatioResult['status'], string> = {
  low: 'text-amber-600 dark:text-amber-400',
  high: 'text-amber-600 dark:text-amber-400',
  balanced: 'text-emerald-600 dark:text-emerald-400',
};

/** Lifetime totals, key lifts against body weight and balance ratios. */
export const StrengthBalanceCard = ({
  summary,
  weightUnit,
}: StrengthBalanceCardProps) => {
  const { t } = useTranslation();
  const { keyLifts, ratios } = summarizeStrengthBalance(
    summary.lifts,
    summary.bodyweightKg
  );
  const { lifetime } = summary;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('strengthBalance.title', 'Strength balance')}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {t(
            'strengthBalance.subtitle',
            'All-time bests, estimated one-rep max'
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-semibold">
              {formatWeight(Math.round(lifetime.volumeKg), weightUnit)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {t('strengthBalance.lifetimeVolume', 'Lifetime volume')}
            </div>
          </div>
          <div>
            <div className="text-lg font-semibold">
              {formatNumber(lifetime.sets)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {t('strengthBalance.lifetimeSets', 'Sets')}
            </div>
          </div>
          <div>
            <div className="text-lg font-semibold">
              {formatNumber(lifetime.sessions)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {t('strengthBalance.lifetimeSessions', 'Sessions')}
            </div>
          </div>
        </div>

        {keyLifts.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {keyLifts.map((row) => (
              <li key={row.lift} className="flex items-center justify-between">
                <span>
                  {liftLabel(t, row.lift)}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {row.exerciseName}
                  </span>
                </span>
                <span className="font-medium">
                  {formatWeight(row.estimatedOneRMKg, weightUnit)}
                  {row.bodyweightMultiple != null && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t('strengthBalance.bodyweightMultiple', {
                        defaultValue: '{{value}}× body weight',
                        value: row.bodyweightMultiple.toFixed(2),
                      })}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t(
              'strengthBalance.noKeyLifts',
              'Log a squat, bench press, deadlift, overhead press or row to see how they compare.'
            )}
          </p>
        )}

        {ratios.length > 0 && (
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('strengthBalance.ratios', 'Ratios')}
            </p>
            <ul className="space-y-1 text-sm">
              {ratios.map((ratio) => (
                <li
                  key={ratio.key}
                  className="flex items-center justify-between"
                >
                  <span>
                    {liftLabel(t, ratio.top)} / {liftLabel(t, ratio.bottom)}
                  </span>
                  <span>
                    <span className="font-medium">
                      {ratio.value.toFixed(2)}
                    </span>
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({ratio.low.toFixed(2)}–{ratio.high.toFixed(2)})
                    </span>
                    <span
                      className={`ml-2 text-xs ${STATUS_CLASS[ratio.status]}`}
                    >
                      {statusLabel(t, ratio.status)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {summary.bodyweightKg == null && keyLifts.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t(
              'strengthBalance.noBodyweight',
              'Log your body weight to see lifts as a multiple of it.'
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
