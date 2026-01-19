import React from 'react';
import { View, Text, Switch, Image } from 'react-native';
import styles from '../screens/SettingsScreenStyles';
import { HEALTH_METRICS, HealthMetric } from '../constants/HealthMetrics';
import { useTheme } from '../contexts/ThemeContext';

// Re-export HealthMetric for backwards compatibility
export type { HealthMetric };

export type HealthMetricStates = Record<string, boolean>;

interface HealthDataSyncProps {
  healthMetricStates: HealthMetricStates;
  handleToggleHealthMetric: (metric: HealthMetric, newValue: boolean) => void;
  isAllMetricsEnabled: boolean;
  handleToggleAllMetrics: () => void;
}

const HealthDataSync: React.FC<HealthDataSyncProps> = ({
  healthMetricStates,
  handleToggleHealthMetric,
  isAllMetricsEnabled,
  handleToggleAllMetrics,
}) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Health Data to Sync</Text>
      <View style={[styles.settingItem, { borderBottomColor: colors.border }]}>
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
      {HEALTH_METRICS.map((metric) => (
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
      ))}
    </View>
  );
};

export default HealthDataSync;
