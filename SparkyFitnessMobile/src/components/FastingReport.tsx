import React, { useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import { isValidTimeZone, todayInZone } from '@workspace/shared';

import SegmentedControl from './SegmentedControl';
import { FastingStatCard } from './FastingSharedComponents';
import { useFastingRange } from '../hooks/useFasting';
import { usePreferences } from '../hooks/usePreferences';
import { METABOLIC_STAGES } from '../constants/fasting';
import { formatLocalizedNumber, useAppLocale } from '../localization';
import { addDays, formatDateLabel } from '../utils/dateUtils';
import {
  dailyTotals,
  fastsInWindow,
  heatLevel,
  summarizeFasts,
  zoneCounts,
  type FastingReportRange,
} from '../utils/fastingReport';
import { localizeFastingStage } from '../utils/fastingLocalization';

const HEATMAP_DAYS = 90;
const BAR_AREA_HEIGHT = 96;
const HEAT_OPACITY = [0, 0.25, 0.45, 0.7, 1] as const;

const formatHours = (hours: number) =>
  formatLocalizedNumber(hours, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <View className="bg-surface rounded-xl p-4 mb-4 border border-border-subtle shadow-sm">
    <Text className="text-xs font-semibold uppercase text-text-muted tracking-wide mb-3">
      {title}
    </Text>
    {children}
  </View>
);

/**
 * Fasting report tab: summary tiles, daily duration bars, stage distribution
 * and a 90-day consistency heatmap. One 90-day range query feeds every section;
 * the 7/30/90-day selector only narrows the summary, bars and stage mix.
 */
const FastingReport: React.FC = () => {
  const { t } = useTranslation();
  const dateLocale = useAppLocale();
  const [range, setRange] = useState<FastingReportRange>(30);
  const [accentPrimary, borderSubtle] = useCSSVariable([
    '--color-accent-primary',
    '--color-border-subtle',
  ]) as [string, string];
  const stageColors = useCSSVariable(
    METABOLIC_STAGES.map((s) => s.colorVar)
  ) as string[];

  const {
    preferences,
    isLoading: preferencesLoading,
    isError: preferencesFailed,
    refetch: refetchPreferences,
  } = usePreferences();
  const timezone =
    preferences?.timezone && isValidTimeZone(preferences.timezone)
      ? preferences.timezone
      : 'UTC';
  // The range endpoint uses the profile timezone, or UTC when that zone is
  // missing. Don't query or draw days until preferences have loaded. A failed
  // load stays disabled and shows the error below.
  const today = todayInZone(timezone);
  const heatmapStart = addDays(today, -(HEATMAP_DAYS - 1));
  const { data, isLoading, isError } = useFastingRange(heatmapStart, today, {
    enabled: !preferencesFailed && !preferencesLoading,
  });

  const report = useMemo(() => {
    const all = data ?? [];
    const days = dailyTotals(all, today, range, timezone);
    const windowFasts = fastsInWindow(all, today, range, timezone);
    return {
      days,
      summary: summarizeFasts(windowFasts),
      zones: zoneCounts(windowFasts, METABOLIC_STAGES.length),
      heatmap: dailyTotals(all, today, HEATMAP_DAYS, timezone),
    };
  }, [data, range, today, timezone]);

  const peakHours = Math.max(0, ...report.days.map((d) => d.hours));
  const maxHours = Math.max(1, peakHours);
  const maxZone = Math.max(1, ...report.zones);

  return (
    <View className="pt-2">
      <View className="mb-4">
        <SegmentedControl
          segments={[
            {
              key: '7',
              label: t('fastingReport.range.7d', { defaultValue: '7 days' }),
            },
            {
              key: '30',
              label: t('fastingReport.range.30d', { defaultValue: '30 days' }),
            },
            {
              key: '90',
              label: t('fastingReport.range.90d', { defaultValue: '90 days' }),
            },
          ]}
          activeKey={String(range)}
          onSelect={(key) => setRange(Number(key) as FastingReportRange)}
        />
      </View>

      {preferencesFailed ? (
        <View className="items-center py-12 bg-surface rounded-2xl border border-border-subtle">
          <Text className="text-sm text-text-muted text-center">
            {t('fastingReport.loadFailed', {
              defaultValue: 'Could not load your fasting report.',
            })}
          </Text>
          <Pressable
            onPress={() => void refetchPreferences()}
            className="mt-3"
            accessibilityRole="button"
          >
            <Text className="text-sm font-semibold text-accent-primary">
              {t('common.retry', { defaultValue: 'Retry' })}
            </Text>
          </Pressable>
        </View>
      ) : preferencesLoading || isLoading ? (
        <View className="items-center py-12">
          <ActivityIndicator size="small" color={accentPrimary} />
        </View>
      ) : isError ? (
        <View className="items-center py-12 bg-surface rounded-2xl border border-border-subtle">
          <Text className="text-sm text-text-muted">
            {t('fastingReport.loadFailed', {
              defaultValue: 'Could not load your fasting report.',
            })}
          </Text>
        </View>
      ) : (
        <>
          <View className="flex-row gap-3 mb-3">
            <FastingStatCard
              label={t('fastingReport.totalFasts', {
                defaultValue: 'Total fasts',
              })}
              value={formatLocalizedNumber(report.summary.totalFasts)}
            />
            <FastingStatCard
              label={t('fastingReport.totalHours', {
                defaultValue: 'Total hours',
              })}
              value={formatHours(report.summary.totalHours)}
            />
          </View>
          <View className="flex-row gap-3 mb-4">
            <FastingStatCard
              label={t('fastingReport.avgDuration', {
                defaultValue: 'Avg fast',
              })}
              value={formatHours(report.summary.avgHours)}
              unit={t('time.hoursShort', { defaultValue: 'h' })}
            />
            <FastingStatCard
              label={t('fastingReport.longestFast', {
                defaultValue: 'Longest',
              })}
              value={formatHours(report.summary.longestHours)}
              unit={t('time.hoursShort', { defaultValue: 'h' })}
            />
          </View>

          <SectionCard
            title={t('fastingReport.dailyDuration', {
              defaultValue: 'Daily fasting duration',
            })}
          >
            <View
              className="flex-row items-end"
              style={{ height: BAR_AREA_HEIGHT, gap: range === 90 ? 1 : 3 }}
              accessibilityLabel={t('fastingReport.dailyDurationA11y', {
                defaultValue: 'Bar chart of hours fasted per day',
              })}
            >
              {report.days.map((day) => (
                <View
                  key={day.date}
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: Math.max(
                      day.hours > 0 ? 3 : 1,
                      (day.hours / maxHours) * BAR_AREA_HEIGHT
                    ),
                    backgroundColor:
                      day.hours > 0 ? accentPrimary : borderSubtle,
                  }}
                />
              ))}
            </View>
            <View className="flex-row justify-between mt-2">
              <Text className="text-xs text-text-muted">
                {report.days[0]?.date
                  ? formatDateLabel(report.days[0].date, t, dateLocale)
                  : ''}
              </Text>
              <Text className="text-xs text-text-muted">
                {t('fastingReport.peakHours', {
                  defaultValue: 'Peak {{hours}}h',
                  hours: formatHours(peakHours),
                })}
              </Text>
              <Text className="text-xs text-text-muted">
                {report.days[report.days.length - 1]?.date
                  ? formatDateLabel(
                      report.days[report.days.length - 1].date,
                      t,
                      dateLocale
                    )
                  : ''}
              </Text>
            </View>
          </SectionCard>

          <SectionCard
            title={t('fastingReport.zoneDistribution', {
              defaultValue: 'Fasting stages reached',
            })}
          >
            {METABOLIC_STAGES.map((stage, index) => (
              <View key={stage.key} className="flex-row items-center mb-2">
                <Text
                  className="text-sm text-text-secondary"
                  style={{ width: 96 }}
                  numberOfLines={1}
                >
                  {localizeFastingStage(t, stage).name}
                </Text>
                <View className="flex-1 h-3 rounded-full bg-raised overflow-hidden mx-2">
                  <View
                    className="h-3 rounded-full"
                    style={{
                      width: `${(report.zones[index] / maxZone) * 100}%`,
                      backgroundColor: stageColors[index] ?? accentPrimary,
                    }}
                  />
                </View>
                <Text
                  className="text-sm font-semibold text-text-primary text-right"
                  style={{ width: 28 }}
                >
                  {report.zones[index]}
                </Text>
              </View>
            ))}
          </SectionCard>

          <SectionCard
            title={t('fastingReport.heatmap', {
              defaultValue: 'Consistency (last 90 days)',
            })}
          >
            <View
              className="flex-row flex-wrap"
              style={{ gap: 3 }}
              accessibilityLabel={t('fastingReport.heatmapA11y', {
                defaultValue: 'Heatmap of days with a fast',
              })}
            >
              {report.heatmap.map((day) => {
                const level = heatLevel(day.hours);
                return (
                  <View
                    key={day.date}
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      backgroundColor:
                        level === 0 ? borderSubtle : accentPrimary,
                      opacity: level === 0 ? 1 : HEAT_OPACITY[level],
                    }}
                  />
                );
              })}
            </View>
            <View className="flex-row items-center mt-3">
              <Text className="text-xs text-text-muted mr-2">
                {t('fastingReport.less', { defaultValue: 'Less' })}
              </Text>
              {HEAT_OPACITY.map((opacity, level) => (
                <View
                  key={level}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    marginRight: 3,
                    backgroundColor: level === 0 ? borderSubtle : accentPrimary,
                    opacity: level === 0 ? 1 : opacity,
                  }}
                />
              ))}
              <Text className="text-xs text-text-muted ml-1">
                {t('fastingReport.more', { defaultValue: 'More' })}
              </Text>
            </View>
          </SectionCard>
        </>
      )}
    </View>
  );
};

export default FastingReport;
