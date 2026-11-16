import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  bacInDisplayUnit,
  bacModelOf,
  bloodAlcoholAt,
  bloodAlcoholChartWindow,
  bloodAlcoholCurve,
  dayToUtcRange,
  isValidTimeZone,
} from '@workspace/shared';
import type {
  BacBodyInput,
  BacDisplayUnit,
  BloodAlcoholResponse,
} from '@workspace/shared';
import KineticsCurveChart from './charts/KineticsCurveChart';
import { usePreferences } from '../hooks/usePreferences';
import { formatLocalizedNumber } from '../localization';
import { getDeviceTimezone } from '../utils/dateUtils';
import { formatDateToTimeLabel } from '../utils/entryTimeDisplay';

type BloodAlcoholCardProps = {
  /** The viewed day, YYYY-MM-DD. */
  date: string;
  estimate: BloodAlcoholResponse | undefined;
  nowMs: number;
  isLoading: boolean;
};

/** A value already in `unit`, with the precision that unit is read at. */
const formatInUnit = (value: number, unit: BacDisplayUnit): string => {
  const digits = unit === 'percent' ? 3 : 2;
  return formatLocalizedNumber(value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const formatBac = (permille: number, unit: BacDisplayUnit): string =>
  formatInUnit(bacInDisplayUnit(permille, unit), unit);

const unitLabel = (t: TFunction, unit: BacDisplayUnit): string =>
  unit === 'percent'
    ? t('bloodAlcohol.unitPercent', { defaultValue: '%' })
    : t('bloodAlcohol.unitPermille', { defaultValue: '‰' });

const missingInputLabel = (t: TFunction, input: BacBodyInput): string => {
  switch (input) {
    case 'sex':
      return t('bloodAlcohol.missingSex', {
        defaultValue: 'Sex: set it in your profile on the web',
      });
    case 'weight':
      return t('bloodAlcohol.missingWeight', {
        defaultValue: 'Weight: log it in Measurements',
      });
    case 'height':
      return t('bloodAlcohol.missingHeight', {
        defaultValue: 'Height: log it in Measurements',
      });
    case 'age':
      return t('bloodAlcohol.missingAge', {
        defaultValue: 'Age: set your date of birth in your profile on the web',
      });
  }
};

/** Shown whenever the card is, never behind a toggle. */
const BloodAlcoholDisclaimer: React.FC = () => {
  const { t } = useTranslation();
  return (
    <Text className="text-text-secondary text-xs text-left leading-normal mt-2">
      {t('bloodAlcohol.disclaimer', {
        defaultValue:
          'Rough estimate only. The real value can differ by 20% or more. Never use it to decide whether you are fit to drive.',
      })}
    </Text>
  );
};

/**
 * Estimated blood alcohol from the drinks logged around the day. Every number
 * comes from the shared model, so it matches the web card and the assistant.
 * It deliberately states no time at which the estimate reaches zero.
 */
const BloodAlcoholCard: React.FC<BloodAlcoholCardProps> = ({
  date,
  estimate,
  nowMs,
  isLoading,
}) => {
  const { t } = useTranslation();
  const { preferences } = usePreferences();

  const model = useMemo(
    () => (estimate ? bacModelOf(estimate) : null),
    [estimate]
  );

  // The server reads the day in the profile time zone, so the chart window,
  // its clock labels and the peak time do too.
  const profileTimezone = preferences?.timezone;
  const timezone =
    profileTimezone && isValidTimeZone(profileTimezone)
      ? profileTimezone
      : getDeviceTimezone();
  const day = useMemo(() => {
    const { start, end } = dayToUtcRange(date, timezone);
    return { startMs: start.getTime(), endMs: end.getTime() };
  }, [date, timezone]);

  const chartWindow = useMemo(
    () =>
      estimate
        ? bloodAlcoholChartWindow(estimate.doses, model, day, nowMs)
        : null,
    [estimate, model, day, nowMs]
  );

  const chartData = useMemo(() => {
    if (!estimate || !model || !chartWindow) return [];
    return bloodAlcoholCurve(
      estimate.doses,
      model,
      chartWindow.from,
      chartWindow.to,
      10
    ).map((point) => ({
      t: point.t,
      value: bacInDisplayUnit(point.permille, estimate.display_unit),
    }));
  }, [estimate, model, chartWindow]);

  if (isLoading || !estimate) return null;
  if (estimate.status === 'ok' && estimate.doses.length === 0) {
    // An estimate card on a day without drinks is noise, not information.
    return null;
  }

  const unit = estimate.display_unit;
  // The server fills this only for today, the one day "now" belongs to.
  const showNow = estimate.estimated_now_permille !== null;

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <Text className="text-text-primary text-lg font-semibold mb-2">
        {t('bloodAlcohol.title', { defaultValue: 'Estimated Blood Alcohol' })}
      </Text>

      {estimate.status === 'missing_inputs' ? (
        <View testID="blood-alcohol-missing-inputs">
          <Text className="text-text-primary text-sm mb-1">
            {t('bloodAlcohol.missingInputs', {
              defaultValue: 'Add these to your profile to see an estimate:',
            })}
          </Text>
          {estimate.missing_inputs.map((input) => (
            <Text key={input} className="text-text-muted text-sm">
              {'• '}
              {missingInputLabel(t, input)}
            </Text>
          ))}
        </View>
      ) : null}

      {estimate.status === 'implausible_inputs' ? (
        <Text
          className="text-text-primary text-sm"
          testID="blood-alcohol-implausible-inputs"
        >
          {t('bloodAlcohol.implausibleInputs', {
            defaultValue:
              'Your weight or height looks wrong, so there is no estimate. Check your latest weight and height in Measurements.',
          })}
        </Text>
      ) : null}

      {estimate.status === 'ok' ? (
        <>
          <View className="flex-row justify-between mb-3">
            {showNow ? (
              <View>
                <Text className="text-text-muted text-xs">
                  {t('bloodAlcohol.estimatedNow', {
                    defaultValue: 'Estimated now',
                  })}
                </Text>
                <Text className="text-text-primary text-2xl font-bold">
                  {formatBac(
                    bloodAlcoholAt(estimate.doses, model, nowMs),
                    unit
                  )}
                  <Text className="text-text-muted text-xs">
                    {' '}
                    {unitLabel(t, unit)}
                  </Text>
                </Text>
              </View>
            ) : null}
            {estimate.peak ? (
              <View>
                <Text className="text-text-muted text-xs">
                  {t('bloodAlcohol.peakAt', {
                    defaultValue: 'Peak at {{time}}',
                    time: formatDateToTimeLabel(
                      new Date(estimate.peak.at),
                      preferences?.time_format,
                      undefined,
                      timezone
                    ),
                  })}
                </Text>
                <Text className="text-text-primary text-2xl font-bold">
                  {formatBac(estimate.peak.permille, unit)}
                  <Text className="text-text-muted text-xs">
                    {' '}
                    {unitLabel(t, unit)}
                  </Text>
                </Text>
              </View>
            ) : null}
          </View>

          {chartData.length > 0 ? (
            <KineticsCurveChart
              data={chartData}
              testID="blood-alcohol-chart"
              timeZone={timezone}
              formatYLabel={(value) => formatInUnit(value, unit)}
            />
          ) : null}

          {estimate.fell_back_from ? (
            <Text
              className="text-text-muted text-[11px] text-center mt-1"
              testID="blood-alcohol-formula-fallback"
            >
              {t('bloodAlcohol.formulaFallback', {
                defaultValue:
                  'Your chosen formula does not fit your body measurements, so the Watson formula is used.',
              })}
            </Text>
          ) : null}

          {estimate.has_estimated_times ? (
            <Text className="text-text-muted text-[11px] text-center mt-1">
              {t('bloodAlcohol.estimatedTimes', {
                defaultValue: 'Some drink times were estimated',
              })}
            </Text>
          ) : null}
        </>
      ) : null}

      <BloodAlcoholDisclaimer />
    </View>
  );
};

export default BloodAlcoholCard;
