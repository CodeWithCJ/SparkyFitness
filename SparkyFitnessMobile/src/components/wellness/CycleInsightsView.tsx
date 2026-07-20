import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useCycleInsights } from '../../hooks/useCycleInsights';
import { useCycleHistory } from '../../hooks/useCycleHistory';
import { useCycleSettings } from '../../hooks/useCycleSettings';
import { predictNextCycles } from '@workspace/shared';
import { getTodayDate, formatDate } from '../../utils/dateUtils';

import Icon from '../Icon';
import BBTLineChart from './BBTLineChart';
import CorrelationCards from './CorrelationCards';

const CycleInsightsView: React.FC = () => {
  const [accentColor, textMuted, dangerColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-icon-danger',
  ]) as [string, string, string];
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
      <View className="bg-surface rounded-2xl p-4 border border-border-subtle shadow-sm gap-4">
        <Text className="text-text-primary text-base font-bold">Cycle Summary</Text>
        <View className="flex-row justify-between">
          <View className="flex-1 items-center border-r border-border-subtle">
            <Text className="text-text-secondary text-xs">Avg Cycle</Text>
            <Text className="text-text-primary text-lg font-bold mt-1">
              {cycleStats.avgCycleLength} days
            </Text>
          </View>
          <View className="flex-1 items-center border-r border-border-subtle">
            <Text className="text-text-secondary text-xs">Avg Period</Text>
            <Text className="text-text-primary text-lg font-bold mt-1">
              {cycleStats.avgPeriodLength} days
            </Text>
          </View>
          <View className="flex-1 items-center">
            <Text className="text-text-secondary text-xs">Regularity</Text>
            <Text className="text-text-primary text-lg font-bold mt-1 capitalize">
              {settings?.avg_cycle_length_override ? 'Set' : 'Regular'}
            </Text>
          </View>
        </View>
      </View>

      {/* 2. Predictions & Confidence */}
      {predictions && predictions.cycles.length > 0 && (
        <View className="bg-surface rounded-2xl p-4 border border-border-subtle shadow-sm gap-3">
          <View className="flex-row justify-between items-center">
            <Text className="text-text-primary text-base font-bold">Next Predictions</Text>
            <View className="bg-blue-50 px-2 py-0.5 rounded-md">
              <Text className="text-blue-600 text-xs font-semibold uppercase">
                {predictions.confidence} confidence
              </Text>
            </View>
          </View>
          <View className="gap-3">
            {predictions.cycles.slice(0, 2).map((c, index) => (
              <View
                key={index}
                className="flex-row items-center justify-between py-2 border-b border-border-subtle last:border-b-0"
              >
                <View>
                  <Text className="text-text-primary font-semibold text-sm">
                    Cycle starting {c.periodStart}
                  </Text>
                  <Text className="text-text-secondary text-xs mt-0.5">
                    Period: {c.periodStart} - {c.periodEnd}
                  </Text>
                </View>
                <Icon name="logs" size={20} color={textMuted} />
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 3. Anomalies/Alerts */}
      {anomalies.length > 0 && (
        <View className="bg-surface rounded-2xl p-4 border border-border-subtle shadow-sm gap-3">
          <Text className="text-text-primary text-base font-bold">Clinical Health Alerts</Text>
          <View className="gap-2">
            {anomalies.map((anom: { message: string }, idx: number) => (
              <View
                key={idx}
                className="flex-row items-start p-3 bg-red-50/50 rounded-xl border border-red-200"
              >
                <View className="mr-2.5 mt-0.5">
                  <Icon name="warning" size={16} color={dangerColor} />
                </View>
                <Text className="flex-1 text-xs text-text-primary leading-normal">
                  {anom.message}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 4. BBT Chart */}
      <View className="gap-2">
        <Text className="text-text-primary text-base font-bold px-1">Basal Body Temperature</Text>
        <BBTLineChart data={bbtData} isLoading={isLoading} />
      </View>

      {/* 5. Symptom Forecasting */}
      <View className="bg-surface rounded-2xl p-4 border border-border-subtle shadow-sm gap-3">
        <Text className="text-text-primary text-base font-bold">Symptom Forecast</Text>
        {forecastEntries.length === 0 ? (
          <Text className="text-text-secondary text-xs italic text-center py-4">
            Log symptoms across a couple of cycles to forecast upcoming days.
          </Text>
        ) : (
          <View className="gap-2">
            {forecastEntries.map((f) => (
              <View key={f.date} className="flex-row justify-between items-start py-1 gap-3">
                <Text className="text-text-primary text-sm font-semibold">{formatDate(f.date)}</Text>
                <Text className="flex-1 text-right text-text-secondary text-xs capitalize">
                  {f.symptoms.join(', ')}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 6. Personalized Correlations */}
      <View className="gap-2">
        <Text className="text-text-primary text-base font-bold px-1">Personal Correlations</Text>
        <CorrelationCards />
      </View>
    </View>
  );
};

export default CycleInsightsView;
