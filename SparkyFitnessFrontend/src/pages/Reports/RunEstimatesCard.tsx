import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { RunningEstimatesResponse } from '@workspace/shared';

interface RunEstimatesCardProps {
  data: RunningEstimatesResponse | undefined;
}

/**
 * VO2 max and average running power worked out from logged runs. Both are
 * estimates from a model (pace, heart rate, weight and climb), so they are
 * labelled as such and never presented as a measurement. Nothing shows until
 * there is at least one of them.
 */
const RunEstimatesCard = ({ data }: RunEstimatesCardProps) => {
  const { t } = useTranslation();
  if (!data || (!data.vo2Max && !data.power)) return null;

  const decimal = (value: number) =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
      value
    );
  const whole = (value: number) =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
      value
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('runEstimates.title', 'Running Estimates')}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {t(
            'runEstimates.subtitle',
            'Estimated from your pace, heart rate, weight and climb. Not a measurement, so expect it to be off by several percent.'
          )}
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        {data.vo2Max ? (
          <div data-testid="run-estimate-vo2">
            <div className="text-2xl font-bold">
              ≈ {decimal(data.vo2Max.value)}
            </div>
            <div className="text-xs text-muted-foreground">
              {t('runEstimates.vo2Unit', 'VO₂ max (ml/kg/min)')}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {t('runEstimates.vo2Basis', {
                count: data.vo2Max.runs,
                defaultValue: 'From {{count}} runs in the last 6 weeks',
              })}
            </div>
          </div>
        ) : null}
        {data.power ? (
          <div data-testid="run-estimate-power">
            <div className="text-2xl font-bold">
              ≈ {whole(data.power.averageWatts)} W
            </div>
            <div className="text-xs text-muted-foreground">
              {t('runEstimates.powerUnit', {
                perKg: decimal(data.power.wattsPerKg),
                defaultValue: 'Running power ({{perKg}} W/kg)',
              })}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {t('runEstimates.powerBasis', {
                count: data.power.runs.length,
                defaultValue: 'Average of {{count}} runs in the last 4 weeks',
              })}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default RunEstimatesCard;
