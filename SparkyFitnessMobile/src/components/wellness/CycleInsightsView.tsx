import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ActivityIndicator } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useCycleInsights } from '../../hooks/useCycleInsights';
import { useCycleHistory } from '../../hooks/useCycleHistory';
import { useCycleSettings } from '../../hooks/useCycleSettings';
import { predictNextCycles } from '@workspace/shared';
import { getTodayDate, formatDate, formatShortDate } from '../../utils/dateUtils';

import Icon from '../Icon';
import CycleIcon from './CycleIcon';
import BBTLineChart from './BBTLineChart';
import CorrelationCards from './CorrelationCards';
import {
  localizeCycleSymptom,
  localizeCycleAnomaly,
} from '../../utils/cycleLocalization';

const CycleInsightsView: React.FC = () => {
  const { t , i18n: translationI18n } = useTranslation();
  const dateLocale = translationI18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const [accentColor, dangerColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-danger',
  ]) as [string, string];
  const { insights, isLoading: isInsightsLoading } = useCycleInsights();
  const { cycles, isLoading: isHistoryLoading } = useCycleHistory();
  const { settings, isLoading: isSettingsLoading } = useCycleSettings();

  const isLoading = isInsightsLoading || isHistoryLoading || isSettingsLoading;

  const cycleStats = useMemo(() => {
    const completed = cycles.filter((c) => c.cycle_length && c.period_length);
    const cycleLengths = completed.map((c) => c.cycle_length!);
    const periodLengths = completed.map((c) => c.period_length!);

    return {
      avgCycleLength: settings?.avg_cycle_length_override ?? (cycleLengths.length
        ? Math.round(cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length)
        : 28),
      avgPeriodLength: settings?.avg_period_length_override ?? (periodLengths.length
        ? Math.round(periodLengths.reduce((a, b) => a + b, 0) / periodLengths.length)
        : 5),
      regularity: 'regular' as const,
      sampleSize: cycleLengths.length,
      medianCycleLength: 28,
      cycleLengthSd: 0,
    };
  }, [cycles, settings]);

  const predictions = useMemo(() => {
    const lastCycle = cycles[0];
    if (!lastCycle || !lastCycle.start_date || !settings) return null;
    return predictNextCycles(cycleStats, lastCycle.start_date, settings);
  }, [cycles, cycleStats, settings]);

  const bbtData = Array.isArray(insights?.bbtSeries) ? insights.bbtSeries : [];
  const anomalies = Array.isArray(insights?.anomalies) ? insights.anomalies : [];

  // The server's `forecast` is a Record<dateString, symptomName[]> — a map of
  // upcoming days to the symptoms expected on them, NOT an array. Flatten the
  // next few upcoming days into a renderable list.
  const forecastEntries = useMemo(() => {
    const raw = insights?.forecast;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const today = getTodayDate();
    return (Object.entries(raw as Record<string, string[]>) as [string, string[]][])
      .filter(([date, symptoms]) => date >= today && Array.isArray(symptoms) && symptoms.length > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 5)
      .map(([date, symptoms]) => ({ date, symptoms }));
  }, [insights]);

  if (isLoading) {
    return (
      <View className="py-12 justify-center items-center">
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  return (
    <View className="gap-6">
      {/* 1. Stats Summary Card */}
      <View className="bg-surface rounded-xl p-4 shadow-sm gap-4">
        <Text className="text-text-secondary text-base font-semibold">{t('cycleInsights.cycleSummary', { defaultValue: 'Cycle Summary' })}</Text>
        <View className="flex-row justify-between">
          <View className="flex-1 items-center border-r border-border-subtle">
            <Text className="text-text-secondary text-xs font-medium">{t('cycleInsights.avgCycle', { defaultValue: 'Avg Cycle' })}</Text>
            <Text className="text-text-primary text-lg font-bold mt-1">
              {t('cycleInsights.days', { defaultValue: '{{count}} days', count: cycleStats.avgCycleLength })}
            </Text>
          </View>
          <View className="flex-1 items-center border-r border-border-subtle">
            <Text className="text-text-secondary text-xs font-medium">{t('cycleInsights.avgPeriod', { defaultValue: 'Avg Period' })}</Text>
            <Text className="text-text-primary text-lg font-bold mt-1">
              {t('cycleInsights.days', { defaultValue: '{{count}} days', count: cycleStats.avgPeriodLength })}
            </Text>
          </View>
          <View className="flex-1 items-center">
            <Text className="text-text-secondary text-xs font-medium">{t('cycleInsights.regularity', { defaultValue: 'Regularity' })}</Text>
            <Text className="text-text-primary text-lg font-bold mt-1 capitalize">
              {settings?.avg_cycle_length_override ? t('cycleInsights.set', { defaultValue: 'Set' }) : t('cycleInsights.regular', { defaultValue: 'Regular' })}
            </Text>
          </View>
        </View>
      </View>

      {/* 2. Predictions & Confidence */}
      {predictions && predictions.cycles.length > 0 && (
        <View className="bg-surface rounded-xl p-4 shadow-sm gap-4">
          <Text className="text-text-secondary text-base font-semibold">{t('cycleInsights.nextPredictions', { defaultValue: 'Next Predictions' })}</Text>

          <View className="gap-4">
            {predictions.cycles.slice(0, 2).map((c, index) => (
              <View key={index} className="gap-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wider">
                    {index === 0 ? t('cycleInsights.upcomingCycle', { defaultValue: 'Upcoming Cycle' }) : t('cycleInsights.followingCycle', { defaultValue: 'Following Cycle' })}
                  </Text>
                  <Text className="text-text-secondary text-sm font-medium">
                    {formatShortDate(c.periodStart, dateLocale)} – {formatShortDate(c.periodEnd, dateLocale)}
                  </Text>
                </View>

                <View className="flex-row gap-2.5">
                  {/* {t('cycleInsights.nextPeriod', { defaultValue: 'Next Period' })} Tile */}
                  <View className="flex-1 bg-surface rounded-xl p-3 flex-row items-center gap-2.5 shadow-sm">
                    <View className="w-8 h-8 items-center justify-center">
                      <CycleIcon id="flow-medium" size={32} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-text-secondary text-xs font-semibold uppercase">
                        {t('cycleInsights.nextPeriod', { defaultValue: 'Next Period' })}
                      </Text>
                      <Text className="text-text-primary text-sm font-bold mt-0.5">
                        {formatShortDate(c.periodStart, dateLocale)}
                      </Text>
                    </View>
                  </View>

                  {/* {t('cycleInsights.estimatedOvulation', { defaultValue: 'Est. Ovulation' })} Tile */}
                  {c.ovulation && (
                    <View className="flex-1 bg-surface rounded-xl p-3 flex-row items-center gap-2.5 shadow-sm">
                      <View className="w-8 h-8 items-center justify-center">
                        <CycleIcon id="ovulation" size={32} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-text-secondary text-xs font-semibold uppercase">
                          {t('cycleInsights.estimatedOvulation', { defaultValue: 'Est. Ovulation' })}
                        </Text>
                        <Text className="text-text-primary text-sm font-bold mt-0.5">
                          {formatShortDate(c.ovulation, dateLocale)}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 3. Anomalies/Alerts */}
      {anomalies.length > 0 && (
        <View className="bg-surface rounded-xl p-4 shadow-sm gap-3">
          <Text className="text-text-secondary text-base font-semibold">{t('cycleInsights.patternsToWatch', { defaultValue: 'Patterns to Watch' })}</Text>
          <View className="gap-2">
            {anomalies.map((anom: { key: string; message: string; params?: Record<string, number> }, idx: number) => (
              <View
                key={idx}
                className="flex-row items-start p-2"
              >
                <View className="mr-2.5 mt-0.5">
                  <Icon name="warning" size={18} color={dangerColor} />
                </View>
                <Text className="flex-1 text-sm text-text-primary leading-normal">
                  {localizeCycleAnomaly(anom.key, anom.message, t, anom.params)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 4. BBT Chart */}
      <View className="gap-2">
        <BBTLineChart data={bbtData} isLoading={isLoading} />
      </View>

      {/* 5. {t('cycleInsights.symptomForecast', { defaultValue: 'Symptom Forecast' })}ing */}
      <View className="bg-surface rounded-xl p-4 shadow-sm gap-3">
        <Text className="text-text-secondary text-base font-semibold">{t('cycleInsights.symptomForecast', { defaultValue: 'Symptom Forecast' })}</Text>
        {forecastEntries.length === 0 ? (
          <Text className="text-text-secondary text-sm italic text-center py-4">
            {t('cycleInsights.forecastHint', { defaultValue: 'Log symptoms across a couple of cycles to forecast upcoming days.' })}
          </Text>
        ) : (
          <View className="gap-2">
            {forecastEntries.map((f) => (
              <View key={f.date} className="flex-row justify-between items-start py-1 gap-3">
                <Text className="text-text-secondary text-sm font-semibold">{formatDate(f.date, dateLocale)}</Text>
                <Text className="flex-1 text-right text-text-primary text-sm capitalize">
                  {f.symptoms.map((s) => localizeCycleSymptom(s, t)).join(', ')}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 6. Personalized Correlations */}
      <View className="gap-2">
        <Text className="text-text-secondary text-base font-semibold px-1">{t('cycleInsights.personalCorrelations', { defaultValue: 'Personal Correlations' })}</Text>
        <CorrelationCards />
      </View>
    </View>
  );
};

export default CycleInsightsView;
