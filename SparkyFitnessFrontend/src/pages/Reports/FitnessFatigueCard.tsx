import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  FitnessFatigueResponse,
  FormStatus,
  ReadinessFactor,
  ReadinessLevel,
} from '@workspace/shared';

/** Days of form drawn as bars. */
const FORM_DAYS = 28;
const BAR_AREA_HEIGHT = 64;

interface FitnessFatigueCardProps {
  data: FitnessFatigueResponse | undefined;
}

const LEVEL_COLOR: Record<ReadinessLevel, string> = {
  noData: 'text-muted-foreground',
  low: 'text-red-500',
  moderate: 'text-yellow-600',
  high: 'text-green-600',
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="text-center">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-lg font-bold">{value}</div>
  </div>
);

/**
 * Today's readiness to train hard and the fitness / fatigue / form numbers
 * behind it, with the last four weeks of form. A guide built from your own
 * workouts, sleep and (when recorded) resting heart rate and HRV, not a
 * measurement.
 */
const FitnessFatigueCard = ({ data }: FitnessFatigueCardProps) => {
  const { t } = useTranslation();
  if (!data) return null;

  const { readiness, fitnessFatigue } = data;
  const today = fitnessFatigue.today;
  const recent = fitnessFatigue.points.slice(-FORM_DAYS);
  const peak = Math.max(1, ...recent.map((point) => Math.abs(point.form)));
  const half = BAR_AREA_HEIGHT / 2;
  const factors = Object.entries(readiness.factors) as [
    ReadinessFactor,
    number,
  ][];
  const number = (value: number, digits = 0) =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(
      value
    );
  const statusKey: Record<FormStatus, string | null> = {
    noData: null,
    learning: 'learning',
    fresh: 'fresh',
    neutral: 'neutral',
    tired: 'tired',
  };
  const status = statusKey[fitnessFatigue.status];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('fitnessFatigue.title', 'Readiness and Form')}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {t(
            'fitnessFatigue.subtitle',
            'How ready you are today, from training form, sleep and resting heart rate.'
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold">
              {readiness.score === null ? '–' : number(readiness.score)}
            </span>
            <span className="text-sm text-muted-foreground mb-1">
              {t('fitnessFatigue.outOf', 'readiness out of 100')}
            </span>
          </div>
          <p className={`text-sm ${LEVEL_COLOR[readiness.level]}`}>
            {t(`fitnessFatigue.level.${readiness.level}`, {
              defaultValue: {
                high: 'Ready for a hard session.',
                moderate: 'Fine for a normal session, but not your hardest.',
                low: 'Not recovered. An easy day or rest is the better call.',
                noData:
                  'Not enough to go on yet. Log workouts and sleep to see your readiness.',
              }[readiness.level],
            })}
          </p>
        </div>

        {factors.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {factors.map(([factor, score]) => {
              const vital =
                factor === 'hrv' || factor === 'restingHeartRate'
                  ? readiness.vitals?.[factor]
                  : undefined;
              const unit = factor === 'hrv' ? 'hrv' : 'restingHeartRate';
              return (
                <li key={factor}>
                  <div className="flex justify-between">
                    <span
                      className={
                        factor === readiness.weakest
                          ? 'font-semibold'
                          : 'text-muted-foreground'
                      }
                    >
                      {t(`fitnessFatigue.factor.${factor}`, {
                        defaultValue: {
                          form: 'Training form',
                          sleep: 'Sleep',
                          restingHeartRate: 'Resting heart rate',
                          hrv: 'HRV',
                        }[factor],
                      })}
                    </span>
                    <span className="text-muted-foreground">
                      {number(score)}
                    </span>
                  </div>
                  {vital ? (
                    <p className="text-xs text-muted-foreground">
                      {t(
                        vital.nights === undefined
                          ? `fitnessFatigue.vital.${unit}`
                          : `fitnessFatigue.vital.${unit}Nights`,
                        {
                          current: number(vital.current, 1),
                          baseline: number(vital.baseline, 1),
                          count: vital.nights,
                          defaultValue: `{{current}} ${unit === 'hrv' ? 'ms' : 'bpm'} against your usual {{baseline}} ${unit === 'hrv' ? 'ms' : 'bpm'}${vital.nights === undefined ? '' : ' (median of {{count}} nights)'}`,
                        }
                      )}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {today ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat
                label={t('fitnessFatigue.fitness', 'Fitness')}
                value={number(today.fitness)}
              />
              <Stat
                label={t('fitnessFatigue.fatigue', 'Fatigue')}
                value={number(today.fatigue)}
              />
              <Stat
                label={t('fitnessFatigue.form', 'Form')}
                value={number(today.form)}
              />
            </div>
            <div
              className="relative flex items-center gap-0.5"
              style={{ height: BAR_AREA_HEIGHT }}
              role="img"
              aria-label={t(
                'fitnessFatigue.chartLabel',
                'Form over the last four weeks'
              )}
            >
              {recent.map((point) => {
                const size = Math.max(
                  2,
                  Math.round((Math.abs(point.form) / peak) * half)
                );
                return (
                  <div
                    key={point.day}
                    data-testid="form-bar"
                    className="relative flex-1 h-full"
                    title={`${point.day}: ${number(point.form)}`}
                  >
                    <div
                      className={`absolute inset-x-0 rounded-sm ${
                        point.form >= 0 ? 'bg-green-500' : 'bg-orange-500'
                      }`}
                      style={{
                        height: size,
                        top: point.form >= 0 ? half - size : half,
                      }}
                    />
                  </div>
                );
              })}
            </div>
            {status ? (
              <p className="text-xs text-muted-foreground">
                {t(`fitnessFatigue.status.${status}`, {
                  defaultValue: {
                    fresh:
                      'Fresh: recent training is light against what you have built.',
                    tired:
                      'Tired: recent training is heavy against what you have built.',
                    neutral:
                      'Balanced: recent training matches what you have built.',
                    learning: 'Still learning your normal. Keep logging.',
                  }[status],
                })}
              </p>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default FitnessFatigueCard;
