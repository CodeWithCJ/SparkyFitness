import React from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeBottomTabScreenProps } from '@bottom-tabs/react-navigation';
import type { TabParamList } from '../types/navigation';

type WorkoutsScreenProps = NativeBottomTabScreenProps<TabParamList, 'Workouts'>;

const WorkoutsScreen: React.FC<WorkoutsScreenProps> = () => {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 bg-background justify-center items-center"
      style={{ paddingTop: insets.top }}
    >
      <Text className="text-2xl font-bold text-text-primary mb-2">Workouts</Text>
      <Text className="text-base text-text-secondary">Coming soon</Text>
    </View>
  );
};

export default WorkoutsScreen;
