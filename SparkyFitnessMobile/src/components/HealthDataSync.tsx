import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Switch, Image, Platform, TouchableOpacity } from 'react-native';
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
  const [learnMoreExpanded, setLearnMoreExpanded] = useState(false);

  const isIOS = Platform.OS === 'ios';
  const platformSubtitle = isIOS ? 'Apple Health' : 'Health Connect';
  const platformSummary = isIOS
    ? 'Reads selected data from Apple Health and syncs it to your self-hosted server.'
    : 'Reads selected data from Health Connect and syncs it to your self-hosted server.';
  const platformDetail = isIOS
    ? 'SparkyFitness reads the health data you select below using Apple Health (HealthKit). If sync is enabled, data is synchronized only between your device and your self-hosted SparkyFitness server (manual or background).\n\nManage or remove access in Settings → Health → Data Access & Devices → SparkyFitnessMobile'
    : 'SparkyFitness reads the health data you select below using Health Connect. If sync is enabled, data is synchronized only between your device and your self-hosted SparkyFitness server (manual or background).';

  const handleLearnMoreToggle = useCallback(() => {
    setLearnMoreExpanded((prev) => !prev);
  }, []);

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
      <View className="mb-3">
        <Text className="text-sm font-semibold text-text-secondary mb-1">{platformSubtitle}</Text>
        <Text className="text-sm text-text-secondary">{platformSummary}</Text>
        {learnMoreExpanded && (
          <Text className="text-sm text-text-secondary mt-2">{platformDetail}</Text>
        )}
        <TouchableOpacity onPress={handleLearnMoreToggle} activeOpacity={0.7}>
          <Text className="text-sm font-medium mt-1" style={{ color: primary }}>
            {learnMoreExpanded ? 'Show less' : 'Learn more'}
          </Text>
        </TouchableOpacity>
      </View>
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
