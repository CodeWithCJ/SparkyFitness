import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CartesianChart, Line } from 'victory-native';
import { DashPathEffect } from '@shopify/react-native-skia';
import { useCSSVariable } from 'uniwind';
import { getAppLocale } from '../localization/i18n';
import {
  activeCaffeineAt,
  caffeineCurve,
  thresholdCrossingTime,
} from '@workspace/shared';
import type { CaffeineActiveResponse } from '@workspace/shared';
import { makeChartFont, CHART_LABEL_FONT_SIZE } from './charts/chartFormatting';
import LineSeriesMark from './charts/LineSeriesMark';

const font = makeChartFont(CHART_LABEL_FONT_SIZE);

/** Local HH:MM for an instant, in the app's locale rather than the device's. */
const clockLabel = (instant: string | number) =>
  new Date(instant).toLocaleTimeString(getAppLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  });

type CaffeineCardProps = {
  kinetics: CaffeineActiveResponse | undefined;
  nowMs: number;
  isLoading: boolean;
};

/**
 * Mirrors the web Diary card: the circulating figure now, the projection at
 * bedtime, when another dose stops being affordable, and the curve joining
 * them. Every number comes from the shared kinetics helpers, so the two
 * platforms cannot drift apart.
 */
const CaffeineCard: React.FC<CaffeineCardProps> = ({
  kinetics,
  nowMs,
  isLoading,
}) => {
  const { t } = useTranslation();
  const [accentColor, dangerColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-danger',
    '--color-text-muted',
  ]) as [string, string, string];

  const bedtimeMs = kinetics ? new Date(kinetics.bedtime_at).getTime() : 0;

  // The plotted window belongs to the day on screen, and the wall clock must
  // never widen it: the card renders for whatever date the dashboard shows, so
  // on a past day `nowMs` sits outside the window and stretching the range to
  // reach it walked the whole span at 15-minute steps with no cap.
  const windowMs = useMemo(() => {
    if (!kinetics || kinetics.doses.length === 0) return null;
    const firstDoseMs = kinetics.doses.reduce(
      (earliest, dose) => Math.min(earliest, new Date(dose.at).getTime()),
      Number.POSITIVE_INFINITY
    );
    const end = bedtimeMs + 2 * 60 * 60 * 1000;
    // `bedtime_at` sits on the date being viewed, so the 24 hours before it are
    // that day. Only a clock inside them belongs on this chart; anything else
    // is a different day and must not drag the window across to meet it.
    const nowBelongsToDay =
      nowMs >= bedtimeMs - 24 * 60 * 60 * 1000 && nowMs <= end;
    const doseStart = firstDoseMs - 60 * 60 * 1000;
    return {
      start: nowBelongsToDay ? Math.min(doseStart, nowMs) : doseStart,
      end,
      nowBelongsToDay,
    };
  }, [kinetics, bedtimeMs, nowMs]);

  // "Now" on the day being viewed, otherwise that day's edge, so the active
  // figure describes the day on screen rather than this instant.
  const referenceMs =
    windowMs && !windowMs.nowBelongsToDay ? windowMs.end : nowMs;

  const chartData = useMemo(() => {
    if (!kinetics || kinetics.doses.length === 0 || !windowMs) return [];
    return caffeineCurve(
      kinetics.doses,
      windowMs.start,
      windowMs.end,
      kinetics.half_life_hours,
      15
    ).map((point) => ({
      ...point,
      // A constant series is how a threshold line is drawn here: victory-native
      // has no reference-line primitive.
      threshold: kinetics.threshold_mg,
    }));
  }, [kinetics, windowMs]);

  const crossingAt = useMemo(
    () =>
      kinetics
        ? thresholdCrossingTime(
            kinetics.doses,
            kinetics.half_life_hours,
            kinetics.threshold_mg
          )
        : null,
    [kinetics]
  );

  if (isLoading || !kinetics || kinetics.doses.length === 0) {
    // A caffeine card on a day with no caffeine is noise, not information.
    return null;
  }

  const activeNowMg = activeCaffeineAt(
    kinetics.doses,
    referenceMs,
    kinetics.half_life_hours
  );

  const cutoffText =
    kinetics.cutoff_state === 'by' && kinetics.latest_safe_dose_time
      ? kinetics.latest_safe_dose_time
      : kinetics.cutoff_state === 'passed'
        ? t('caffeine.cutoffPassed', { defaultValue: 'Too late' })
        : kinetics.cutoff_state === 'over'
          ? t('caffeine.cutoffOver', { defaultValue: 'Over' })
          : t('caffeine.anytimeSafe', { defaultValue: 'Any time' });

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <Text className="text-text-primary text-lg font-semibold mb-2">
        {t('caffeine.title', { defaultValue: 'Active Caffeine' })}
      </Text>

      <View className="flex-row justify-between mb-3">
        <View>
          <Text className="text-text-muted text-xs">
            {t('caffeine.activeNow', { defaultValue: 'Active now' })}
          </Text>
          <Text className="text-text-primary text-2xl font-bold">
            {Math.round(activeNowMg)}
            <Text className="text-text-muted text-xs">
              {' '}
              {t('caffeine.unitMg', { defaultValue: 'mg' })}
            </Text>
          </Text>
        </View>
        <View>
          <Text className="text-text-muted text-xs">
            {t('caffeine.atBedtime', { defaultValue: 'At {{time}}' }).replace(
              '{{time}}',
              kinetics.target_bedtime
            )}
          </Text>
          <Text className="text-text-primary text-2xl font-bold">
            {Math.round(kinetics.at_bedtime_mg)}
            <Text className="text-text-muted text-xs">
              {' '}
              {t('caffeine.unitMg', { defaultValue: 'mg' })}
            </Text>
          </Text>
        </View>
        <View>
          <Text className="text-text-muted text-xs">
            {t('caffeine.lastDose', { defaultValue: 'Last dose by' })}
          </Text>
          <Text className="text-text-primary text-2xl font-bold">
            {cutoffText}
          </Text>
        </View>
      </View>

      <View style={{ height: 150 }} testID="caffeine-chart">
        <CartesianChart
          data={chartData}
          xKey="t"
          yKeys={['mg', 'threshold']}
          domainPadding={{ left: 10, right: 10, top: 12 }}
          xAxis={{
            font,
            tickCount: 4,
            labelColor: textMuted,
            formatXLabel: (value: number) => clockLabel(value),
          }}
          yAxis={[{ font, tickCount: 4, labelColor: textMuted }]}
        >
          {({ points }) => (
            <>
              {/* Dashed so it reads as a limit rather than a second series. */}
              <Line
                points={points.threshold}
                color={dangerColor}
                strokeWidth={1}
              >
                <DashPathEffect intervals={[4, 4]} />
              </Line>
              <LineSeriesMark
                points={points.mg}
                color={accentColor}
                strokeWidth={2}
                curveType="linear"
                connectMissingData
              />
            </>
          )}
        </CartesianChart>
      </View>

      {/* The plot carries two series and no axis legend, so name them. */}
      <View className="flex-row justify-center items-center gap-4 mt-1">
        <View className="flex-row items-center gap-1.5">
          <View
            style={{ width: 14, height: 2, backgroundColor: accentColor }}
          />
          <Text className="text-text-muted text-[11px]">
            {t('caffeine.legendCurve', { defaultValue: 'Active caffeine' })}
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View
            style={{
              width: 14,
              height: 0,
              borderTopWidth: 1,
              borderStyle: 'dashed',
              borderColor: dangerColor,
            }}
          />
          <Text className="text-text-muted text-[11px]">
            {t('caffeine.legendThreshold', {
              defaultValue: '{{threshold}}mg threshold',
            }).replace('{{threshold}}', String(kinetics.threshold_mg))}
          </Text>
        </View>
      </View>

      <Text className="text-text-muted text-xs text-center mt-1">
        {crossingAt
          ? t('caffeine.crossingNote', {
              defaultValue: 'Back under {{threshold}}mg from {{time}}',
            })
              .replace('{{threshold}}', String(kinetics.threshold_mg))
              .replace('{{time}}', clockLabel(crossingAt))
          : t('caffeine.underThreshold', {
              defaultValue: 'Stays under {{threshold}}mg tonight',
            }).replace('{{threshold}}', String(kinetics.threshold_mg))}
      </Text>

      {kinetics.has_estimated_times ? (
        <Text className="text-text-muted text-[11px] text-center mt-1">
          {t('caffeine.estimatedTimes', {
            defaultValue: 'Some dose times were estimated',
          })}
        </Text>
      ) : null}
    </View>
  );
};

export default CaffeineCard;
