import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Info, Wine } from 'lucide-react';
import { ReferenceDot } from 'recharts';
import {
  addDays,
  bacInDisplayUnit,
  bacModelOf,
  bloodAlcoholAt,
  bloodAlcoholChartWindow,
  bloodAlcoholCurve,
  DEFAULT_BAC_DISPLAY_UNIT,
  type BacBodyInput,
  type BacDisplayUnit,
  type BacDistributionFormula,
} from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { KineticsChart, KineticsDoseChips } from '@/components/KineticsChart';
import { useBloodAlcoholQuery } from '@/hooks/Diary/useBloodAlcohol';
import { useNowTicker } from '@/hooks/useNowTicker';
import { formatRelativeDateTime, localDayStartMs } from '@/utils/kineticsTime';

// Indigo is alcohol's colour elsewhere in the app (Reports' weekly alcohol card).
const BAC_COLOR = '#6366f1';

const BAC_DECIMALS: Record<BacDisplayUnit, number> = {
  permille: 2,
  percent: 3,
};
const BAC_SYMBOL: Record<BacDisplayUnit, string> = {
  permille: '‰',
  percent: '%',
};
/** Smallest y-axis top, so a tiny curve is not stretched to fill the chart. */
const MIN_Y_MAX_PERMILLE = 0.2;

const PROFILE_INPUTS: readonly BacBodyInput[] = ['sex', 'age'];
const CHECK_IN_INPUTS: readonly BacBodyInput[] = ['weight', 'height'];

interface BloodAlcoholCardProps {
  date: string;
}

export const BloodAlcoholCard = ({ date }: BloodAlcoholCardProps) => {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useBloodAlcoholQuery(date);
  const nowMs = useNowTicker();

  const dayStartMs = localDayStartMs(date);
  const dayEndMs = localDayStartMs(addDays(date, 1));
  // The server decides "today" in the profile's time zone, as on mobile.
  const isToday = data?.estimated_now_permille != null;

  const model = useMemo(() => (data ? bacModelOf(data) : null), [data]);

  const chartWindow = useMemo(() => {
    if (
      !data ||
      data.status !== 'ok' ||
      dayStartMs === null ||
      dayEndMs === null
    ) {
      return null;
    }
    const span = bloodAlcoholChartWindow(
      data.doses,
      model,
      { startMs: dayStartMs, endMs: dayEndMs },
      nowMs
    );
    return span ? { start: span.from, end: span.to } : null;
  }, [data, model, dayStartMs, dayEndMs, nowMs]);

  const unit = data?.display_unit ?? DEFAULT_BAC_DISPLAY_UNIT;
  const chart = useMemo(() => {
    if (!data || !model || !chartWindow) return [];
    return bloodAlcoholCurve(
      data.doses,
      model,
      chartWindow.start,
      chartWindow.end
    ).map((point) => ({
      t: point.t,
      value: bacInDisplayUnit(point.permille, unit),
    }));
  }, [data, model, chartWindow, unit]);

  const formatDisplay = (value: number) => value.toFixed(BAC_DECIMALS[unit]);
  const formatBac = (permille: number) =>
    formatDisplay(bacInDisplayUnit(permille, unit));
  const relativeLabels = {
    yesterday: t('common.yesterday', 'Yesterday'),
    tomorrow: t('common.tomorrow', 'Tomorrow'),
  };

  const shell = (content: ReactNode, hasEstimatedTimes = false) => (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center space-x-2">
          <Wine className="w-5 h-5 text-indigo-500" />
          <CardTitle className="text-base font-medium">
            {t('diary.bloodAlcohol.title', 'Estimated Blood Alcohol')}
          </CardTitle>
        </div>
        {hasEstimatedTimes && (
          <Badge
            variant="outline"
            className="text-[11px] text-muted-foreground flex items-center gap-1"
          >
            <Info className="w-3 h-3" />
            {t('diary.bloodAlcohol.estimatedTimes', 'Estimated times')}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {content}
        {/* Shown in every state: the number is a model, not a measurement. */}
        <Alert className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            {t(
              'diary.bloodAlcohol.disclaimer',
              'Rough estimate only. Your real blood alcohol can differ by 20% or more. Never use it to decide whether you are fit to drive.'
            )}
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return shell(<Skeleton className="h-24 w-full" />);
  }

  if (isError) {
    return shell(
      <p className="text-sm text-muted-foreground">
        {t(
          'diary.bloodAlcohol.failedToLoad',
          'Failed to load the blood alcohol estimate.'
        )}
      </p>
    );
  }

  if (data?.status === 'missing_inputs') {
    const inputLabels: Record<BacBodyInput, string> = {
      sex: t('diary.bloodAlcohol.inputs.sex', 'sex'),
      weight: t('diary.bloodAlcohol.inputs.weight', 'weight'),
      height: t('diary.bloodAlcohol.inputs.height', 'height'),
      age: t('diary.bloodAlcohol.inputs.age', 'date of birth'),
    };
    const joinInputs = (inputs: readonly BacBodyInput[]) =>
      inputs.map((input) => inputLabels[input]).join(', ');
    const missing = data.missing_inputs;
    const missingProfile = missing.filter((input) =>
      PROFILE_INPUTS.includes(input)
    );
    return shell(
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {t('diary.bloodAlcohol.missingInputs', {
            defaultValue:
              'To estimate your blood alcohol, add your {{inputs}}. There is no estimate until then.',
            inputs: joinInputs(missing),
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          {missingProfile.length > 0 && (
            <Button asChild variant="outline" size="sm">
              <Link to="/settings?section=profile-information">
                {t('diary.bloodAlcohol.openProfile', {
                  defaultValue: 'Set your {{inputs}} in your profile',
                  inputs: joinInputs(missingProfile),
                })}
              </Link>
            </Button>
          )}
          {missing.some((input) => CHECK_IN_INPUTS.includes(input)) && (
            <Button asChild variant="outline" size="sm">
              <Link to="/checkin">
                {t(
                  'diary.bloodAlcohol.openCheckIn',
                  'Log weight and height in Check-In'
                )}
              </Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (data?.status === 'implausible_inputs') {
    return shell(
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {t(
            'diary.bloodAlcohol.implausibleInputs',
            'Your weight and height do not give a plausible body, so there is no estimate. Check your latest values in Check-In.'
          )}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/checkin">
            {t('diary.bloodAlcohol.checkMeasurements', 'Check measurements')}
          </Link>
        </Button>
      </div>
    );
  }

  if (!data || !model || !chartWindow || data.doses.length === 0) {
    return shell(
      <p className="text-sm text-muted-foreground">
        {t('diary.bloodAlcohol.empty', 'No alcohol logged for this day.')}
      </p>
    );
  }

  const { doses, peak, has_estimated_times, fell_back_from } = data;
  // Formula names as Preferences shows them (Watson is never the one replaced).
  const formulaNames: Record<BacDistributionFormula, string> = {
    widmark: t('settings.preferences.bacFormula.widmark', 'Widmark'),
    watson: t('settings.preferences.bacFormula.watson', 'Watson (default)'),
    seidl: t('settings.preferences.bacFormula.seidl', 'Seidl'),
    forrest: t('settings.preferences.bacFormula.forrest', 'Forrest'),
  };
  const symbol = BAC_SYMBOL[unit];
  const nowInWindow =
    isToday && nowMs >= chartWindow.start && nowMs <= chartWindow.end;
  const peakDisplay = chart.reduce(
    (max, point) => Math.max(max, point.value),
    0
  );
  const yMax =
    Math.max(peakDisplay, bacInDisplayUnit(MIN_Y_MAX_PERMILLE, unit)) * 1.15;
  const windowDoses = doses.filter((dose) => {
    const doseMs = new Date(dose.at).getTime();
    return doseMs >= chartWindow.start && doseMs <= chartWindow.end;
  });

  return shell(
    <>
      <div className="grid grid-cols-2 gap-3">
        {isToday && (
          <div className="flex flex-col p-3 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/50 dark:border-indigo-900/40">
            <span className="text-xs text-muted-foreground">
              {t('diary.bloodAlcohol.estimatedNow', 'Estimated now')}
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
                {formatBac(bloodAlcoholAt(doses, model, nowMs))}
              </span>
              <span className="text-xs text-muted-foreground">{symbol}</span>
            </div>
          </div>
        )}
        <div className="flex flex-col p-3 rounded-lg bg-muted/40 border">
          <span className="text-xs text-muted-foreground">
            {t('diary.bloodAlcohol.peak', 'Estimated peak')}
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-bold">
              {formatBac(peak?.permille ?? 0)}
            </span>
            <span className="text-xs text-muted-foreground">{symbol}</span>
          </div>
          {peak && (
            <span className="text-[10px] text-muted-foreground mt-0.5">
              {formatRelativeDateTime(peak.at, date, relativeLabels)}
            </span>
          )}
        </div>
      </div>

      {fell_back_from && (
        <p className="text-xs text-muted-foreground">
          {t('diary.bloodAlcohol.formulaFellBack', {
            defaultValue:
              'The {{formula}} formula does not fit your body measurements, so this estimate uses Watson.',
            formula: formulaNames[fell_back_from],
          })}
        </p>
      )}

      <div className="pt-1">
        <KineticsChart
          data={chart}
          dataKey="value"
          window={chartWindow}
          viewedDate={date}
          yMax={yMax}
          color={BAC_COLOR}
          gradientId="bloodAlcoholFill"
          nowMs={nowInWindow ? nowMs : null}
          valueLabel={t('diary.bloodAlcohol.legendCurve', 'Estimated BAC')}
          formatValue={(value) => `${formatDisplay(value)} ${symbol}`}
        >
          {/* A drink whose time was assumed rather than logged is hollow. */}
          {windowDoses.map((dose, idx) => {
            const doseMs = new Date(dose.at).getTime();
            return (
              <ReferenceDot
                key={`${dose.at}-${idx}`}
                x={doseMs}
                y={bacInDisplayUnit(bloodAlcoholAt(doses, model, doseMs), unit)}
                r={4}
                fill={dose.is_estimated ? 'transparent' : BAC_COLOR}
                stroke={BAC_COLOR}
                strokeWidth={dose.is_estimated ? 1.5 : 1}
                strokeDasharray={dose.is_estimated ? '2 2' : '0'}
                ifOverflow="hidden"
              />
            );
          })}
        </KineticsChart>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground pt-1">
          <span className="flex items-center gap-1">
            <span className="h-[2px] w-4 rounded bg-indigo-500" />
            {t('diary.bloodAlcohol.legendCurve', 'Estimated BAC')}
          </span>
          {nowInWindow && (
            <span className="flex items-center gap-1">
              <span className="h-3 w-0 border-l-2 border-slate-600 dark:border-slate-400" />
              {t('diary.bloodAlcohol.legendNow', 'Now')}
            </span>
          )}
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-indigo-500" />
            {t('diary.bloodAlcohol.legendDrink', 'Logged drink')}
          </span>
          {has_estimated_times && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full border border-dashed border-indigo-500" />
              {t('diary.bloodAlcohol.legendEstimated', 'Assumed time')}
            </span>
          )}
        </div>
      </div>

      <KineticsDoseChips
        title={t('diary.bloodAlcohol.drinks', 'Drinks counted')}
        doses={windowDoses.map((dose) => ({
          at: dose.at,
          label: dose.name || t('diary.bloodAlcohol.drink', 'Drink'),
          amount: t('diary.bloodAlcohol.gramsAlcohol', {
            defaultValue: '{{grams}} g alcohol',
            grams: Math.round(dose.grams * 10) / 10,
          }),
        }))}
        viewedDate={date}
      />
    </>,
    has_estimated_times
  );
};

export default BloodAlcoholCard;
