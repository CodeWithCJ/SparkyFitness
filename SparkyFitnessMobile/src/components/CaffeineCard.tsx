import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  activeCaffeineAt,
  caffeineCurve,
  thresholdCrossingTime,
} from '@workspace/shared';
import type { CaffeineActiveResponse } from '@workspace/shared';
import KineticsCurveChart from './charts/KineticsCurveChart';
import { usePreferences } from '../hooks/usePreferences';
import {
  formatDateToTimeLabel,
  formatTimeLabel,
} from '../utils/entryTimeDisplay';

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
  const { preferences } = usePreferences();

  const clockLabel = (value: number | string | Date) => {
    const d = value instanceof Date ? value : new Date(value);
    return formatDateToTimeLabel(d, preferences?.time_format);
  };

  const bedtimeMs = kinetics ? new Date(kinetics.bedtime_at).getTime() : 0;

  // The calendar start of the viewed day in local time
  const dayStartMs = useMemo(() => {
    if (!kinetics) return 0;
    const [bedtimeHourStr] = kinetics.target_bedtime.split(':');
    const bedtimeHour = parseInt(bedtimeHourStr ?? '22', 10);
    const bedtimeDate = new Date(kinetics.bedtime_at);
    const viewedYear = bedtimeDate.getFullYear();
    const viewedMonth = bedtimeDate.getMonth();
    const viewedDay =
      bedtimeDate.getDate() - (!isNaN(bedtimeHour) && bedtimeHour < 12 ? 1 : 0);
    return new Date(viewedYear, viewedMonth, viewedDay, 0, 0, 0, 0).getTime();
  }, [kinetics]);

  // The plotted window belongs to the day on screen, and the wall clock must
  // never widen it: the card renders for whatever date the dashboard shows, so
  // on a past day `nowMs` sits outside the window and stretching the range to
  // reach it walked the whole span at 15-minute steps with no cap.
  const windowMs = useMemo(() => {
    if (!kinetics || kinetics.doses.length === 0) return null;
    const rawEnd = bedtimeMs + 2 * 60 * 60 * 1000;
    const nowBelongsToDay = nowMs >= dayStartMs && nowMs <= rawEnd;

    const dayDoses = kinetics.doses.filter((dose) => {
      const ms = new Date(dose.at).getTime();
      return ms >= dayStartMs && ms <= rawEnd;
    });

    const firstDoseMs =
      dayDoses.length > 0
        ? dayDoses.reduce(
            (earliest, dose) => Math.min(earliest, new Date(dose.at).getTime()),
            Number.POSITIVE_INFINITY
          )
        : dayStartMs + 8 * 60 * 60 * 1000;
    const doseStart =
      dayDoses.length > 0 ? firstDoseMs - 60 * 60 * 1000 : firstDoseMs;
    const rawStart = nowBelongsToDay ? Math.min(doseStart, nowMs) : doseStart;

    // Align start to the top of the hour without local-time mutation
    const startDate = new Date(rawStart);
    const startRemainderMs =
      (startDate.getMinutes() * 60 + startDate.getSeconds()) * 1000 +
      startDate.getMilliseconds();
    const start = rawStart - startRemainderMs;

    // Align end to the top of the next hour without local-time mutation
    const endDate = new Date(rawEnd);
    const endRemainderMs =
      (endDate.getMinutes() * 60 + endDate.getSeconds()) * 1000 +
      endDate.getMilliseconds();
    const end =
      endRemainderMs === 0 ? rawEnd : rawEnd + (3600 * 1000 - endRemainderMs);

    return {
      start,
      end,
      nowBelongsToDay,
    };
  }, [kinetics, bedtimeMs, nowMs, dayStartMs]);

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
      t: point.t,
      value: point.mg,
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
      ? formatTimeLabel(
          kinetics.latest_safe_dose_time,
          preferences?.time_format
        )
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
              formatTimeLabel(
                kinetics.target_bedtime,
                preferences?.time_format
              ) ?? kinetics.target_bedtime
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

      <KineticsCurveChart
        data={chartData}
        testID="caffeine-chart"
        curveLabel={t('caffeine.legendCurve', {
          defaultValue: 'Active caffeine',
        })}
        threshold={{
          value: kinetics.threshold_mg,
          label: t('caffeine.legendThreshold', {
            defaultValue: '{{threshold}}mg threshold',
          }).replace('{{threshold}}', String(kinetics.threshold_mg)),
        }}
      />

      <Text className="text-text-muted text-xs text-center mt-1">
        {crossingAt && new Date(crossingAt).getTime() >= dayStartMs
          ? t('caffeine.crossingNote', {
              defaultValue: 'Back under {{threshold}}mg from {{time}}',
            })
              .replace('{{threshold}}', String(kinetics.threshold_mg))
              .replace(
                '{{time}}',
                new Date(crossingAt).getTime() >=
                  dayStartMs + 24 * 60 * 60 * 1000
                  ? `${t('caffeine.tomorrow', { defaultValue: 'Tomorrow' })}, ${clockLabel(crossingAt)}`
                  : clockLabel(crossingAt)
              )
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
