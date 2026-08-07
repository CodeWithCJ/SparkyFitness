import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Application from 'expo-application';

import Icon from '../components/Icon';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { RootStackScreenProps } from '../types/navigation';

type AboutScreenProps = RootStackScreenProps<'About'>;

const PROJECT_URL = 'https://github.com/CodeWithCJ/SparkyFitness';
const PRIVACY_POLICY_URL = 'https://codewithcj.github.io/SparkyFitness/privacy_policy';
const DOCUMENTATION_URL = 'https://codewithcj.github.io/SparkyFitness/';

const AboutScreen: React.FC<AboutScreenProps> = () => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() => {
      // Silently ignore — user can copy URL from elsewhere if needed.
    });
  };

  const header = useScreenHeader({ title: 'About', left: { kind: 'back' } });

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding }}
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}
      >

        <View className="bg-surface rounded-xl p-5 mb-4 items-center shadow-sm">
          <Image source={require('../../assets/images/logo.png')} className="w-20 h-20 mb-4" resizeMode="contain" />
          <Text className="text-xl font-bold text-text-primary mb-1">SparkyFitness</Text>
          <Text className="text-text-secondary text-sm">
            Version {Application.nativeApplicationVersion} ({Application.nativeBuildVersion})
          </Text>
        </View>

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <Text className="text-base font-semibold text-text-primary mb-2">About this app</Text>
          <Text className="text-text-secondary text-sm leading-5">
            SparkyFitness is an open-source nutrition, exercise, and health-data tracker that
            syncs to your own server. This app is the mobile companion for logging meals,
            workouts, and measurements on the go.
          </Text>
        </View>

        <View className="bg-surface rounded-xl mb-4 shadow-sm">
          <TouchableOpacity
            className="p-4 flex-row items-center justify-between border-b border-border-subtle"
            onPress={() => openUrl(PROJECT_URL)}
            activeOpacity={0.7}
          >
            <Text className="text-base font-semibold text-text-primary">Project on GitHub </Text>
            <Icon name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity
            className="p-4 flex-row items-center justify-between border-b border-border-subtle"
            onPress={() => openUrl(DOCUMENTATION_URL)}
            activeOpacity={0.7}
          >
            <Text className="text-base font-semibold text-text-primary">Documentation </Text>
            <Icon name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity
            className="p-4 flex-row items-center justify-between"
            onPress={() => openUrl(PRIVACY_POLICY_URL)}
            activeOpacity={0.7}
          >
            <Text className="text-base font-semibold text-text-primary">Privacy Policy </Text>
            <Icon name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>


      </ScrollView>
    </View>
  );
};

export default AboutScreen;
