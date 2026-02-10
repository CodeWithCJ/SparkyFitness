import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { seedHealthData } from '../services/seedHealthData';
import { triggerManualSync } from '../services/backgroundSyncService';
import OnboardingModal from './OnboardingModal';

const DevTools: React.FC = () => {
  const [isSeeding, setIsSeeding] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

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
    <View className="bg-section rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-lg font-bold mb-3 text-text-primary">Dev Tools</Text>
      <Text className="text-text-muted mb-3 text-[13px]">
        These tools are only visible in development builds.
      </Text>

      <Text className="text-sm text-text-primary">Seed Health Data</Text>
      <Text className="text-text-muted mb-3 text-[13px]">
        Insert sample health data for testing.
      </Text>

      <View className="flex-row gap-2 flex-wrap justify-between">
        <TouchableOpacity
          className="bg-accent-primary py-2 px-4 rounded-lg my-1 items-center self-center min-w-20"
          style={{ opacity: isSeeding ? 0.6 : 1 }}
          onPress={() => handleSeedData(7)}
          disabled={isSeeding}
        >
          {isSeeding ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white text-base font-bold">7 Days</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-accent-primary py-2 px-4 rounded-lg my-1 items-center self-center min-w-20"
          style={{ opacity: isSeeding ? 0.6 : 1 }}
          onPress={() => handleSeedData(14)}
          disabled={isSeeding}
        >
          <Text className="text-white text-base font-bold">14 Days</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-accent-primary py-2 px-4 rounded-lg my-1 items-center self-center min-w-20"
          style={{ opacity: isSeeding ? 0.6 : 1 }}
          onPress={() => handleSeedData(30)}
          disabled={isSeeding}
        >
          <Text className="text-white text-base font-bold">30 Days</Text>
        </TouchableOpacity>
      </View>

      <View className="mt-5">
        <Text className="text-sm text-text-primary">Background Sync</Text>
        <Text className="text-text-muted mb-3 text-[13px]">
          Manually trigger the background sync process.
        </Text>
        <TouchableOpacity
          className="bg-accent-primary py-2 px-4 rounded-lg my-1 items-center self-center min-w-30"
          style={{ opacity: isSyncing ? 0.6 : 1 }}
          onPress={handleTriggerSync}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white text-base font-bold">Trigger Sync</Text>
          )}
        </TouchableOpacity>
      </View>

      <View className="mt-5">
        <Text className="text-sm text-text-primary">Onboarding Modal</Text>
        <Text className="text-text-muted mb-3 text-[13px]">
          Preview the onboarding modal shown to new users.
        </Text>
        <TouchableOpacity
          className="bg-accent-primary py-2 px-4 rounded-lg my-1 items-center self-center min-w-30"
          onPress={() => setShowOnboarding(true)}
        >
          <Text className="text-white text-base font-bold">View Onboarding</Text>
        </TouchableOpacity>
      </View>

      <OnboardingModal
        visible={showOnboarding}
        onGoToSettings={() => setShowOnboarding(false)}
        onDismiss={() => setShowOnboarding(false)}
      />
    </View>
  );
};

export default DevTools;
