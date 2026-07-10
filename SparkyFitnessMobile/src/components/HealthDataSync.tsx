import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Switch, Image, Platform, ActivityIndicator } from 'react-native';
import { HEALTH_METRICS, HealthMetric, CATEGORY_ORDER } from '../HealthMetrics';
import { useCSSVariable } from 'uniwind';
import Button from './ui/Button';
import CollapsibleSection from './CollapsibleSection';
import { saveCollapsedCategories, loadCollapsedCategories } from '../services/storage';
import { NO_DATA_DISPLAY } from '../services/healthDataDisplay';
import {
  localizeHealthCategory,
  localizeHealthMetricLabel,
  mobileT,
} from '../localization';

// Re-export HealthMetric for backwards compatibility
export type { HealthMetric };

export type HealthMetricStates = Record<string, boolean>;

interface HealthDataSyncProps {
  healthMetricStates: HealthMetricStates;
  handleToggleHealthMetric: (metric: HealthMetric, newValue: boolean) => void;
  isAllMetricsEnabled: boolean;
  handleToggleAllMetrics: () => void;
  healthData?: Record<string, string>;
  isLoadingHealthData?: boolean;
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
  healthData,
  isLoadingHealthData,
}) => {
  const [formEnabled, formDisabled] = useCSSVariable([
    '--color-form-enabled',
    '--color-form-disabled'
  ]) as [string, string];
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  const [learnMoreExpanded, setLearnMoreExpanded] = useState(false);

  const isIOS = Platform.OS === 'ios';
  const platformSubtitle = isIOS
    ? mobileT('sync.appleHealthName')
    : 'Health Connect';
  const platformSummary = isIOS
    ? mobileT('healthSync.appleSummary')
    : mobileT('healthSync.healthConnectSummary');
  const platformDetail = isIOS
    ? mobileT('healthSync.appleDetail')
    : mobileT('healthSync.healthConnectDetail');

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

  const renderMetricItem = (metric: HealthMetric) => {
    const value = healthData?.[metric.id];
    const showLoading = isLoadingHealthData && !value;
    const metricLabel = localizeHealthMetricLabel(metric.id, metric.label);

    return (
      <View key={metric.id} className="flex-row justify-between items-center mb-2">
        <View className="flex-row items-center flex-1 me-2">
          <Image source={metric.icon} className="w-6 h-6" />
          <Text
            className="ms-2 text-base text-text-primary flex-shrink"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {metricLabel}
          </Text>
        </View>
        {showLoading && (
          <ActivityIndicator size="small" className="me-2" />
        )}
        {value && (
          <Text
            className={`text-sm me-2 flex-shrink-0 ${value === NO_DATA_DISPLAY ? 'text-text-muted italic' : 'text-text-muted'}`}
            numberOfLines={1}
          >
            {value}
          </Text>
        )}
        <Switch
          onValueChange={(newValue) => handleToggleHealthMetric(metric, newValue)}
          value={healthMetricStates[metric.stateKey]}
          trackColor={{ false: formDisabled, true: formEnabled }}
          thumbColor="#FFFFFF"
          accessibilityLabel={mobileT('healthSync.metricAccessibility', {
            metric: metricLabel,
          })}
        />
      </View>
    );
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-lg font-bold mb-3 text-text-primary">
        {mobileT('healthSync.dataTitle')}
      </Text>
      <View className="mb-3">
        <Text className="text-sm font-semibold text-text-secondary mb-1">{platformSubtitle}</Text>
        <Text className="text-sm text-text-secondary">{platformSummary}</Text>
        {learnMoreExpanded && (
          <>
            <Text className="text-sm text-text-secondary mt-2">{platformDetail}</Text>
            <Text className="text-sm text-text-secondary mt-1">
              <Text className="font-semibold">{mobileT('sync.medicalDisclaimerTitle')}</Text>{' '}
              {mobileT('sync.medicalDisclaimerDescription')}
            </Text>
          </>
        )}
        <Button
          variant="ghost"
          onPress={handleLearnMoreToggle}
          className="self-start py-0 px-0 mt-1"
          textClassName="text-sm"
        >
          {learnMoreExpanded
            ? mobileT('healthSync.showLess')
            : mobileT('healthSync.learnMore')}
        </Button>
      </View>
      <View className="flex-row justify-between items-center mb-2">
        <View className="flex-row items-center flex-1 me-2">
          <Text
            className="font-bold text-base text-text-primary flex-1"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {mobileT('healthSync.enableAll')}
          </Text>
        </View>
        <Switch
          onValueChange={handleToggleAllMetrics}
          value={isAllMetricsEnabled}
          trackColor={{ false: formDisabled, true: formEnabled }}
          thumbColor="#FFFFFF"
          accessibilityLabel={mobileT('healthSync.enableAll')}
        />
      </View>
      <Text className="text-xs text-text-muted mb-3">
        {mobileT('healthSync.batteryWarning')}
      </Text>
      {isLoaded && CATEGORY_ORDER.map((category) => {
        const metricsInCategory = groupedMetrics[category];
        if (!metricsInCategory || metricsInCategory.length === 0) {
          return null;
        }
        return (
          <CollapsibleSection
            key={category}
            title={localizeHealthCategory(category)}
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
