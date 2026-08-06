import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNutritionTrends, type TrendRange } from '../hooks/useNutritionTrends';
import { getAppLocale } from '../localization';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import StatusView from '../components/StatusView';
import NutrientBarChart from '../components/NutrientBarChart';
import type { RootStackScreenProps } from '../types/navigation';

type NutrientTrendsScreenProps = RootStackScreenProps<'NutrientTrends'>;

const NutrientTrendsScreen: React.FC<NutrientTrendsScreenProps> = ({ route }) => {
  const { t } = useTranslation();
  const { nutrientKey, nutrientLabel, unit, goal } = route.params;
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [range, setRange] = useState<TrendRange>('7d');
  const rangeSegments = useMemo<Segment<TrendRange>[]>(
    () => [
      { key: '7d', label: t('sync.last7Days') },
      { key: '30d', label: t('sync.last30Days') },
      { key: '90d', label: t('sync.last90Days') },
    ],
    [t],
  );

  const header = useScreenHeader({
    title: t('batch.trendTitle', { nutrient: nutrientLabel }),
    left: { kind: 'back' },
  });

  const { data, isLoading, isError } = useNutritionTrends({ range });

  // Map historical trend data to extract values for this specific nutrient
  const chartData = useMemo(() => {
    return data.map((item) => {
      const rawVal = item[nutrientKey];
      const val = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal)) || 0;
      return {
        day: item.date,
        value: val,
      };
    });
  }, [data, nutrientKey]);

  // Compute stats
  const stats = useMemo(() => {
    if (chartData.length === 0) {
      return { average: 0, peak: 0, peakDay: '' };
    }

    const sum = chartData.reduce((acc, point) => acc + point.value, 0);
    const average = sum / chartData.length;

    let peak = 0;
    let peakDay = '';
    chartData.forEach((point) => {
      if (point.value > peak) {
        peak = point.value;
        peakDay = point.day;
      }
    });

    return { average, peak, peakDay };
  }, [chartData]);

  const formattedPeakDay = useMemo(() => {
    if (!stats.peakDay) return '';
    const [year, month, d] = stats.peakDay.split('-').map(Number);
    const date = new Date(year, month - 1, d);
    return date.toLocaleDateString(getAppLocale(), { month: 'short', day: 'numeric' });
  }, [stats.peakDay]);

  if (isLoading) {
    return <StatusView loading className="bg-background" />;
  }

  if (isError) {
    return (
      <View className="flex-1 bg-background justify-center items-center p-4">
        <Text className="text-text-primary text-base font-semibold mb-2">
           {t('batch.trendLoadFailed')}
        </Text>
        <Text className="text-text-secondary text-sm text-center">
           {t('batch.connectionRetry')}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Segmented Range Control */}
        <View className="mb-4">
          <SegmentedControl
             segments={rangeSegments}
            activeKey={range}
            onSelect={setRange}
          />
        </View>

        {/* Nutrient Intake Chart */}
        <NutrientBarChart
          data={chartData}
          isLoading={isLoading}
          isError={isError}
          range={range}
          nutrientLabel={nutrientLabel}
          unit={unit}
          goal={goal}
        />

        {/* Statistics Summary Card */}
        <View className="bg-surface rounded-xl p-4 mt-4 shadow-sm">
          <Text className="text-text-primary text-base font-bold mb-3">
             {t('batch.summary')}
          </Text>

          <View className="flex-row justify-between py-2 border-b border-border-subtle">
             <Text className="text-text-secondary text-sm">{t('batch.dailyAverage')}</Text>
            <Text className="text-text-primary text-sm font-semibold">
              {stats.average % 1 !== 0 ? stats.average.toFixed(1) : stats.average} {unit}
            </Text>
          </View>

          <View className="flex-row justify-between py-2 border-b border-border-subtle">
             <Text className="text-text-secondary text-sm">{t('batch.highestDay')}</Text>
            <View className="items-end">
              <Text className="text-text-primary text-sm font-semibold">
                {stats.peak % 1 !== 0 ? stats.peak.toFixed(1) : stats.peak} {unit}
              </Text>
              {formattedPeakDay ? (
                <Text className="text-text-muted text-xs mt-0.5">{formattedPeakDay}</Text>
              ) : null}
            </View>
          </View>

          {goal && goal > 0 ? (
            <>
              <View className="flex-row justify-between py-2 border-b border-border-subtle">
                 <Text className="text-text-secondary text-sm">{t('batch.targetGoal')}</Text>
                <Text className="text-text-primary text-sm font-semibold">
                  {Math.round(goal).toLocaleString()} {unit}
                </Text>
              </View>

              <View className="flex-row justify-between py-2">
                 <Text className="text-text-secondary text-sm">{t('batch.averageTarget')}</Text>
                <Text className="text-text-primary text-sm font-semibold">
                   {t('batch.percentOfGoal', { percent: Math.round((stats.average / goal) * 100) })}
                </Text>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
};

export default NutrientTrendsScreen;
