import React, { useState } from 'react';
import { View, Text, Alert, ActivityIndicator, Pressable, Platform } from 'react-native';
import Button from './ui/Button';
import { seedHealthData, seedHistoricalSteps } from '../services/seedHealthData';
import { triggerManualSync } from '../services/backgroundSyncService';
import { openHealthConnectSettings, openHealthConnectDataManagement, getGrantedPermissions } from 'react-native-health-connect';

const DevTools: React.FC = () => {
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

  const handleSeedHistoricalSteps = async () => {
    setIsSeeding(true);
    try {
      const result = await seedHistoricalSteps();
      if (result.success) {
        Alert.alert(
          'Success',
          `Seeded ${result.recordsInserted} historical step records across the past year.`
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to seed historical step data.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('Error', `Failed to seed historical step data: ${message}`);
    } finally {
      setIsSeeding(false);
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

  const handleCheckBackgroundPermissions = async () => {
    const permissions = await getGrantedPermissions();
    const hasBackgroundAccess = permissions.some(
      (permission) =>
        permission.accessType === 'read' &&
        permission.recordType === 'BackgroundAccessPermission'
    );

    Alert.alert(
      'Background Access Permission',
      hasBackgroundAccess
        ? 'Background access permission is granted.'
        : 'Background access permission is NOT granted.'
    );
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-lg font-bold mb-3 text-text-primary">Dev Tools</Text>
      <Text className="text-text-muted mb-3 text-[13px]">
        These tools are only visible in development builds.
      </Text>

      <Text className="text-sm text-text-primary">Seed Health Data</Text>
      <Text className="text-text-muted mb-3 text-[13px]">
        Insert sample health data for testing.
      </Text>

      <View className="flex-row gap-2 flex-wrap justify-between">
        <Button
          variant="primary"
          className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
          onPress={() => handleSeedData(7)}
          disabled={isSeeding}
        >
          {isSeeding ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white text-base font-bold">7 Days</Text>
          )}
        </Button>

        <Button
          variant="primary"
          className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
          onPress={() => handleSeedData(14)}
          disabled={isSeeding}
        >
          <Text className="text-white text-base font-bold">14 Days</Text>
        </Button>

        <Button
          variant="primary"
          className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
          onPress={() => handleSeedData(30)}
          disabled={isSeeding}
        >
          <Text className="text-white text-base font-bold">30 Days</Text>
        </Button>

        <Button
          variant="primary"
          className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
          onPress={handleSeedHistoricalSteps}
          disabled={isSeeding}
        >
          <Text className="text-white text-base font-bold text-center">1 Year{'\n'}(Steps)</Text>
        </Button>
      </View>
      {Platform.OS === 'android' && (
        <View className="flex-row gap-2 flex-wrap justify-between mt-4">
          <Pressable
            className="bg-accent-primary py-2 px-4 rounded-lg my-1 items-center self-center min-w-20"
            onPress={() => openHealthConnectSettings()}
          >
            <Text className="text-white text-base font-bold">Health Connect</Text>
          </Pressable>
          <Pressable
            className="bg-accent-primary py-2 px-4 rounded-lg my-1 items-center self-center min-w-20"
            onPress={() => openHealthConnectDataManagement()}
          >
            <Text className="text-white text-base font-bold">Health Connect Data</Text>
          </Pressable>
        </View>
      )}
      <View className="mt-5">
        <Text className="text-sm text-text-primary">Background Sync</Text>
        <Text className="text-text-muted mb-3 text-[13px]">
          Manually trigger the background sync process.
        </Text>
        <View className="flex-row gap-2 flex-wrap justify-between">
          <Button
            variant="primary"
            className="py-2 px-4 rounded-lg my-1 self-center min-w-30"
            onPress={handleTriggerSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-white text-base font-bold">Trigger Sync</Text>
            )}
          </Button>
          {Platform.OS === 'android' && (
            <Button
              variant="primary"
              className="py-2 px-4 rounded-lg my-1 self-center min-w-30"
              onPress={handleCheckBackgroundPermissions}
            >
              <Text className="text-white text-base font-bold">Check BG Permission</Text>
            </Button>
          )}
        </View>
      </View>

    </View>
  );
};

export default DevTools;
