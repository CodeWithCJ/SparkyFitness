import React from 'react';
import { View, Text, Switch, Image, Alert } from 'react-native';
import styles from '../screens/SettingsScreenStyles';
import { HEALTH_METRICS } from '../constants/HealthMetrics';

import { useTheme } from '../contexts/ThemeContext';

const HealthDataSync = ({ healthMetricStates, handleToggleHealthMetric, isAllMetricsEnabled, handleToggleAllMetrics }) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Health Data to Sync</Text>
      <View style={[styles.settingItem, { borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[styles.settingLabel, { fontWeight: 'bold', color: colors.text }]}>Enable All Health Metrics</Text>
        </View>
        <Switch
          onValueChange={handleToggleAllMetrics}
          value={isAllMetricsEnabled}
        />
      </View>
      {HEALTH_METRICS.map((metric) => (
        <View key={metric.id} style={[styles.settingItem, { borderBottomColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Image source={metric.icon} style={styles.icon} />
            <Text style={[styles.settingLabel, { marginLeft: 8, color: colors.text }]}>{metric.label}</Text>
          </View>
          <Switch
            onValueChange={(newValue) => handleToggleHealthMetric(metric, newValue)}
            value={healthMetricStates[metric.stateKey]}
          />
        </View>
      ))}
    </View>
  );
};

export default HealthDataSync;