import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Switch, Image } from 'react-native';
import { HEALTH_METRICS, HealthMetric, CATEGORY_ORDER } from '../HealthMetrics';
import { useCSSVariable } from 'uniwind';
import CollapsibleSection from './CollapsibleSection';
import { saveCollapsedCategories, loadCollapsedCategories } from '../services/storage';

// Re-export HealthMetric for backwards compatibility
export type { HealthMetric };

export type HealthMetricStates = Record<string, boolean>;

interface HealthDataSyncProps {
  healthMetricStates: HealthMetricStates;
  handleToggleHealthMetric: (metric: HealthMetric, newValue: boolean) => void;
  isAllMetricsEnabled: boolean;
  handleToggleAllMetrics: () => void;
}

const groupMetricsByCategory = (metrics: HealthMetric[]): Record<string, HealthMetric[]> => {
  return metrics.reduce((acc, metric) => {
    const category = metric.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(metric);
    return acc;
  }, {} as Record<string, HealthMetric[]>);
};

const HealthDataSync: React.FC<HealthDataSyncProps> = ({
  healthMetricStates,
  handleToggleHealthMetric,
  isAllMetricsEnabled,
  handleToggleAllMetrics,
}) => {
  const [switchTrack, primary] = useCSSVariable([
    '--color-progress-track',
    '--color-accent-primary',
  ]) as [string, string];
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  const [showHealthKitDetails, setShowHealthKitDetails] = useState(false);
  const [showHealthConnectDetails, setShowHealthConnectDetails] = useState(false);

  useEffect(() => {
    loadCollapsedCategories()
      .then((categories) => {
        setCollapsedCategories(new Set(categories));
        setIsLoaded(true);
      })
      .catch(() => {
        // Default: all categories except Common are collapsed
        setCollapsedCategories(new Set(CATEGORY_ORDER.filter(c => c !== 'Common')));
        setIsLoaded(true);
      });
  }, []);

  const handleCategoryToggle = useCallback((category: string) => {
    setCollapsedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      saveCollapsedCategories(Array.from(newSet));
      return newSet;
    });
  }, []);

  const groupedMetrics = groupMetricsByCategory(HEALTH_METRICS);

  const renderMetricItem = (metric: HealthMetric) => (
    <View key={metric.id} className="flex-row justify-between items-center mb-2">
      <View className="flex-row items-center flex-1 mr-2">
        <Image source={metric.icon} className="w-6 h-6" />
        <Text
          className="ml-2 text-base text-text-primary flex-1"
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {metric.label}
        </Text>
      </View>
      <Switch
        onValueChange={(newValue) => handleToggleHealthMetric(metric, newValue)}
        value={healthMetricStates[metric.stateKey]}
        trackColor={{ false: switchTrack, true: primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );

  return (
    <View className="bg-section rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-lg font-bold mb-3 text-text-primary">Health Data to Sync</Text>
      <View className="flex-row justify-between items-center mb-2">
        <View className="flex-row items-center flex-1 mr-2">
          <Text
            className="font-bold text-base text-text-primary flex-1"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            Enable All Health Metrics
          </Text>
        </View>
        <Switch
          onValueChange={handleToggleAllMetrics}
          value={isAllMetricsEnabled}
          trackColor={{ false: switchTrack, true: primary }}
          thumbColor="#FFFFFF"
        />
      </View>
      {isLoaded && CATEGORY_ORDER.map((category) => {
        const metricsInCategory = groupedMetrics[category];
        if (!metricsInCategory || metricsInCategory.length === 0) {
          return null;
        }
        return (
          <CollapsibleSection
            key={category}
            title={category}
            expanded={!collapsedCategories.has(category)}
            onToggle={() => handleCategoryToggle(category)}
            itemCount={metricsInCategory.length}
          >
            {metricsInCategory.map(renderMetricItem)}
          </CollapsibleSection>
        );
      })}
    </View>
  );
};

export default HealthDataSync;
