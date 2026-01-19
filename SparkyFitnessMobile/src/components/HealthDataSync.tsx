import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Switch, Image } from 'react-native';
import styles from '../screens/SettingsScreenStyles';
import { HEALTH_METRICS, HealthMetric, CATEGORY_ORDER } from '../constants/HealthMetrics';
import { useTheme } from '../contexts/ThemeContext';
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
  const { colors } = useTheme();
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);

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
    <View key={metric.id} style={[styles.settingItem, { borderBottomColor: colors.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
        <Image source={metric.icon} style={styles.icon} />
        <Text
          style={[styles.settingLabel, { marginLeft: 8, color: colors.text, flex: 1 }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {metric.label}
        </Text>
      </View>
      <Switch
        onValueChange={(newValue) => handleToggleHealthMetric(metric, newValue)}
        value={healthMetricStates[metric.stateKey]}
        trackColor={{ false: colors.inputBackground, true: colors.primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Health Data to Sync</Text>
      <View style={[styles.settingItem]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
          <Text
            style={[styles.settingLabel, { fontWeight: 'bold', color: colors.text, flex: 1 }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            Enable All Health Metrics
          </Text>
        </View>
        <Switch
          onValueChange={handleToggleAllMetrics}
          value={isAllMetricsEnabled}
          trackColor={{ false: colors.inputBackground, true: colors.primary }}
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
