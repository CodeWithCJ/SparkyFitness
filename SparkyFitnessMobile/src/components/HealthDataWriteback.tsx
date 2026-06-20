import React, { useState } from 'react';
import { View, Text, Switch, Image, Platform } from 'react-native';
import { useCSSVariable } from 'uniwind';
import CollapsibleSection from './CollapsibleSection';
import {
  WRITEBACK_METRICS,
  WRITEBACK_CATEGORY_ORDER,
  type WritebackMetric,
} from '../WritebackMetrics';

interface HealthDataWritebackProps {
  writebackStates: Record<string, boolean>;
  handleToggleWriteback: (metric: WritebackMetric, newValue: boolean) => void;
}

const groupByCategory = (metrics: WritebackMetric[]): Record<string, WritebackMetric[]> =>
  metrics.reduce(
    (acc, metric) => {
      (acc[metric.category] ??= []).push(metric);
      return acc;
    },
    {} as Record<string, WritebackMetric[]>,
  );

/**
 * Opt-in toggles for writing SparkyFitness diary data out to the OS health store
 * (Health Connect on Android, Apple Health on iOS). Grouped into accordion categories
 * to match the read "Health Data to Sync" card. Mobile-only; renders nothing elsewhere.
 */
const HealthDataWriteback: React.FC<HealthDataWritebackProps> = ({
  writebackStates,
  handleToggleWriteback,
}) => {
  const [formEnabled, formDisabled] = useCSSVariable([
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string];
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return null;
  }

  const storeName = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';
  const grouped = groupByCategory(WRITEBACK_METRICS);

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const renderMetricItem = (metric: WritebackMetric) => (
    <View key={metric.id} className="flex-row justify-between items-center mb-2">
      <View className="flex-row items-center flex-1 mr-2">
        <Image source={metric.icon} className="w-6 h-6" />
        <Text className="ml-2 text-base text-text-primary flex-shrink" numberOfLines={1}>
          {metric.label}
        </Text>
      </View>
      <Switch
        onValueChange={(newValue) => handleToggleWriteback(metric, newValue)}
        value={!!writebackStates[metric.id]}
        trackColor={{ false: formDisabled, true: formEnabled }}
        thumbColor="#FFFFFF"
      />
    </View>
  );

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-lg font-bold mb-1 text-text-primary">Write to {storeName}</Text>
      <Text className="text-sm text-text-muted mb-3">
        Syncs the data you log in SparkyFitness out to {storeName}, keeping the two in sync.
      </Text>
      {WRITEBACK_CATEGORY_ORDER.map((category) => {
        const metricsInCategory = grouped[category];
        if (!metricsInCategory || metricsInCategory.length === 0) {
          return null;
        }
        return (
          <CollapsibleSection
            key={category}
            title={category}
            expanded={!collapsedCategories.has(category)}
            onToggle={() => toggleCategory(category)}
            itemCount={metricsInCategory.length}
          >
            {metricsInCategory.map(renderMetricItem)}
          </CollapsibleSection>
        );
      })}
    </View>
  );
};

export default HealthDataWriteback;
