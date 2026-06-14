import React from 'react';
import { Platform, View, Text, ScrollView, TouchableOpacity, Linking, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import * as Application from 'expo-application';

import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import type { RootStackScreenProps } from '../types/navigation';

type AboutScreenProps = RootStackScreenProps<'About'>;

const PROJECT_URL = 'https://github.com/CodeWithCJ/SparkyFitness';
const PRIVACY_POLICY_URL = 'https://codewithcj.github.io/SparkyFitness/privacy_policy';
const DOCUMENTATION_URL = 'https://codewithcj.github.io/SparkyFitness/';

const AboutScreen: React.FC<AboutScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() => {
      // Silently ignore — user can copy URL from elsewhere if needed.
    });
  };

  return (
    <View className="flex-1 bg-background" style={Platform.OS === 'ios' ? undefined : { paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding }}
        contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'automatic' : 'never'}
      >
        {Platform.OS !== 'ios' && (
        <View className="flex-row items-center mb-4">
          <Button
            variant="ghost"
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="py-0 px-0 mr-2"
          >
            <Icon name="chevron-back" size={22} color={accentPrimary} />
          </Button>
          <Text className="text-2xl font-bold text-text-primary">About</Text>
        </View>
        )}

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
            <Text className="text-base font-semibold text-text-primary">Project on GitHub</Text>
            <Icon name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity
            className="p-4 flex-row items-center justify-between border-b border-border-subtle"
            onPress={() => openUrl(DOCUMENTATION_URL)}
            activeOpacity={0.7}
          >
            <Text className="text-base font-semibold text-text-primary">Documentation</Text>
            <Icon name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity
            className="p-4 flex-row items-center justify-between"
            onPress={() => openUrl(PRIVACY_POLICY_URL)}
            activeOpacity={0.7}
          >
            <Text className="text-base font-semibold text-text-primary">Privacy Policy</Text>
            <Icon name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>


      </ScrollView>
    </View>
  );
};

export default AboutScreen;
