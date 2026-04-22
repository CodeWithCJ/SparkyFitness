import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import { useServerConnection } from '../hooks';
import type { RootStackParamList, TabParamList } from '../types/navigation';

type LibraryScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Library'>,
  NativeStackScreenProps<RootStackParamList>
>;

const LibraryScreen: React.FC<LibraryScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding();
  const textSecondary = useCSSVariable('--color-text-secondary') as string;
  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();

  if (!isConnectionLoading && !isConnected) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <StatusView
          icon="cloud-offline"
          iconColor="#9CA3AF"
          iconSize={64}
          title="No server configured"
          subtitle="Configure your server connection in Settings to view your library."
          action={{ label: 'Go to Settings', onPress: () => navigation.navigate('Settings'), variant: 'primary' }}
        />
      </View>
    );
  }

  if (isConnectionLoading) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <StatusView loading title="Loading library..." />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + activeWorkoutBarPadding + 16,
        }}
        contentInsetAdjustmentBehavior="never"
      >
        <View className="mb-6">
          <Text className="text-2xl font-bold text-text-primary">Library</Text>
          <Text className="text-sm text-text-secondary mt-2">
            A home for workout tools and saved training resources.
          </Text>
        </View>

        <TouchableOpacity
          className="bg-surface rounded-xl p-4 flex-row items-center justify-between shadow-sm"
          onPress={() => navigation.navigate('WorkoutHistory')}
          activeOpacity={0.7}
        >
          <View className="flex-1 pr-4">
            <Text className="text-base font-semibold text-text-primary">Workout History</Text>
            <Text className="text-sm text-text-secondary mt-1">
              See your logged workouts and activities.
            </Text>
          </View>
          <Icon name="chevron-forward" size={20} color={textSecondary} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

export default LibraryScreen;
