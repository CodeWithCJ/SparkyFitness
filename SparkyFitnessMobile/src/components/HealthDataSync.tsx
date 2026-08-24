import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Image, Platform, ActivityIndicator } from 'react-native';
import { HEALTH_METRICS, HealthMetric, CATEGORY_ORDER, getHealthMetricLabel, getHealthCategoryLabel } from '../HealthMetrics';
import Button from './ui/Button';
import Switch from './ui/Switch';
import CollapsibleSection from './CollapsibleSection';
import { saveCollapsedCategories, loadCollapsedCategories } from '../services/storage';
import { NO_DATA_DISPLAY } from '../services/healthDataDisplay';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  const [learnMoreExpanded, setLearnMoreExpanded] = useState(false);

  const isIOS = Platform.OS === 'ios';
  const platformSubtitle = isIOS ? t('healthSync.appleHealth', { defaultValue: 'Apple Health' }) : t('healthSync.healthConnect', { defaultValue: 'Health Connect' });
  const platformSummary = isIOS
    ? t('healthSync.appleSummary', { defaultValue: 'Reads selected data from Apple Health and syncs it to your self-hosted server.' })
    : t('healthSync.connectSummary', { defaultValue: 'Reads selected data from Health Connect and syncs it to your self-hosted server.' });
  const platformDetail = isIOS
    ? t('healthSync.appleDetail', { defaultValue: 'SparkyFitness reads the health data you select below using Apple Health (HealthKit). If sync is enabled, data is synchronized only between your device and your self-hosted SparkyFitness server (manual or background).\n\nManage or remove access in Settings → Health → Data Access & Devices → SparkyFitnessMobile' })
    : t('healthSync.connectDetail', { defaultValue: 'SparkyFitness reads the health data you select below using Health Connect. If sync is enabled, data is synchronized only between your device and your self-hosted SparkyFitness server (manual or background).' });

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
    const metricLabel = getHealthMetricLabel(t, metric);
    const value = healthData?.[metric.id];
    const displayValue = value === NO_DATA_DISPLAY
      ? t('healthSync.noData', { defaultValue: 'No data' })
      : value;
    const showLoading = isLoadingHealthData && !value;

    return (
      <View key={metric.id} className="flex-row justify-between items-center mb-2">
        <View className="flex-row items-center flex-1 mr-2">
          <Image source={metric.icon} className="w-6 h-6" />
          <Text
            className="ml-2 text-base text-text-primary flex-shrink"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {metricLabel}
          </Text>
        </View>
        {showLoading && (
          <ActivityIndicator
            size="small"
            className="mr-2"
            accessibilityLabel={t('healthSync.loading', { defaultValue: 'Loading health data' })}
            accessibilityState={{ busy: true }}
          />
        )}
        {value && (
          <Text
            className={`text-sm mr-2 flex-shrink-0 ${value === NO_DATA_DISPLAY ? 'text-text-muted italic' : 'text-text-muted'}`}
            numberOfLines={1}
          >
            {displayValue}
          </Text>
        )}
        <Switch
          accessibilityLabel={t('healthSync.syncMetricLabel', { defaultValue: 'Sync {{metric}}', metric: metricLabel })}
          accessibilityHint={t('healthSync.syncMetricHint', { defaultValue: 'Toggles synchronization for this health metric.' })}
          onValueChange={(newValue) => handleToggleHealthMetric(metric, newValue)}
          value={healthMetricStates[metric.stateKey]}
        />
      </View>
    );
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-lg font-bold mb-3 text-text-primary">{t('healthSync.title', { defaultValue: 'Health Data to Sync' })}</Text>
      <View className="mb-3">
        <Text className="text-sm font-semibold text-text-secondary mb-1">{platformSubtitle}</Text>
        <Text className="text-sm text-text-secondary">{platformSummary}</Text>
        {learnMoreExpanded && (
          <>
            <Text className="text-sm text-text-secondary mt-2">{platformDetail}</Text>
            <Text className="text-sm text-text-secondary mt-1">
              <Text className="font-semibold">{t('healthSync.notMedicalAdvice', { defaultValue: 'Not medical advice.' })}</Text> {t('healthSync.consultProfessional', { defaultValue: 'Consult a healthcare professional for medical advice, diagnosis, or treatment.' })}
            </Text>
          </>
        )}
        <Button
          variant="ghost"
          onPress={handleLearnMoreToggle}
          className="self-start py-0 px-0 mt-1"
          textClassName="text-sm"
          accessibilityRole="button"
          accessibilityState={{ expanded: learnMoreExpanded }}
          accessibilityLabel={learnMoreExpanded
            ? t('common.showLess', { defaultValue: 'Show less' })
            : t('common.learnMore', { defaultValue: 'Learn more' })}
        >
          {learnMoreExpanded ? t('common.showLess', { defaultValue: 'Show less' }) : t('common.learnMore', { defaultValue: 'Learn more' })}
        </Button>
      </View>
      <View className="flex-row justify-between items-center mb-2">
        <View className="flex-row items-center flex-1 mr-2">
          <Text
            className="font-bold text-base text-text-primary flex-1"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {t('healthSync.enableAll', { defaultValue: 'Enable All Health Metrics' })}
          </Text>
        </View>
        <Switch
          accessibilityLabel={t('healthSync.enableAll', { defaultValue: 'Enable All Health Metrics' })}
          accessibilityHint={t('healthSync.enableAllHint', { defaultValue: 'Toggles synchronization for all health metrics.' })}
          onValueChange={handleToggleAllMetrics}
          value={isAllMetricsEnabled}
        />
      </View>
      <Text className="text-xs text-text-muted mb-3">
        {t('healthSync.batteryNote', { defaultValue: 'Enabling many health metrics may increase battery usage. Each enabled metric allows the app to wake in the background when new data is available.' })}
      </Text>
      {isLoaded && CATEGORY_ORDER.map((category) => {
        const metricsInCategory = groupedMetrics[category];
        if (!metricsInCategory || metricsInCategory.length === 0) {
          return null;
        }
        return (
          <CollapsibleSection
            key={category}
            title={getHealthCategoryLabel(t, category)}
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
