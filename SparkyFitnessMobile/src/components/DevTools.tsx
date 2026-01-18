import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import styles from '../screens/SettingsScreenStyles';
import { useTheme } from '../contexts/ThemeContext';
import { seedHealthData } from '../services/seedHealthData';
import { triggerManualSync } from '../services/backgroundSyncService';

const DevTools: React.FC = () => {
  const { colors } = useTheme();
  const [isSeeding, setIsSeeding] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    try {
      await triggerManualSync();
      Alert.alert('Success', 'Background sync completed. Check Logs for details.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('Error', `Sync failed: ${message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSeedData = async (days: number) => {
    setIsSeeding(true);
    try {
      const result = await seedHealthData(days);
      if (result.success) {
        Alert.alert(
          'Success',
          `Seeded ${result.recordsInserted} health records for the past ${days} days.`
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to seed health data.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('Error', `Failed to seed health data: ${message}`);
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Dev Tools</Text>
      <Text style={{ color: colors.textMuted, marginBottom: 12, fontSize: 13 }}>
        These tools are only visible in development builds.
      </Text>

      <Text style={[styles.label, { color: colors.text }]}>Seed Health Data</Text>
      <Text style={{ color: colors.textMuted, marginBottom: 12, fontSize: 13 }}>
        Insert sample health data for testing.
      </Text>

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <TouchableOpacity
          style={[
            styles.addConfigButton,
            { opacity: isSeeding ? 0.6 : 1, minWidth: 80 },
          ]}
          onPress={() => handleSeedData(7)}
          disabled={isSeeding}
        >
          {isSeeding ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.addConfigButtonText}>7 Days</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.addConfigButton,
            { opacity: isSeeding ? 0.6 : 1, minWidth: 80 },
          ]}
          onPress={() => handleSeedData(14)}
          disabled={isSeeding}
        >
          <Text style={styles.addConfigButtonText}>14 Days</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.addConfigButton,
            { opacity: isSeeding ? 0.6 : 1, minWidth: 80 },
          ]}
          onPress={() => handleSeedData(30)}
          disabled={isSeeding}
        >
          <Text style={styles.addConfigButtonText}>30 Days</Text>
        </TouchableOpacity>
      </View>

      <View style={{ marginTop: 20 }}>
        <Text style={[styles.label, { color: colors.text }]}>Background Sync</Text>
        <Text style={{ color: colors.textMuted, marginBottom: 12, fontSize: 13 }}>
          Manually trigger the background sync process.
        </Text>
        <TouchableOpacity
          style={[
            styles.addConfigButton,
            { opacity: isSyncing ? 0.6 : 1, minWidth: 120 },
          ]}
          onPress={handleTriggerSync}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.addConfigButtonText}>Trigger Sync</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default DevTools;
