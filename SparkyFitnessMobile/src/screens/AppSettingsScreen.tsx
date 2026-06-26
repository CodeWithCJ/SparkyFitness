import React from 'react';
import { Platform, View, Text, ScrollView, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import BottomSheetPicker from '../components/BottomSheetPicker';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import {
  useThemePreference,
  setThemePreference,
  type ThemePreference,
} from '../services/themeService';
import { useHapticsEnabled, setHapticsEnabled } from '../services/haptics';
import { useSoundsEnabled, setSoundsEnabled } from '../services/sounds';
import {
  useNotificationsEnabled,
  setNotificationsEnabled,
} from '../services/notifications';
import {
  useLiquidGlassTabBarEnabled,
  setLiquidGlassTabBarEnabled,
} from '../services/nativeTabBarPreference';
import { supportsNativeIOSTabs } from '../utils/nativeTabs';
import type { RootStackScreenProps } from '../types/navigation';

type AppSettingsScreenProps = RootStackScreenProps<'AppSettings'>;

const themeOptions: { label: string; value: ThemePreference }[] = [
  { label: 'Light', value: 'Light' },
  { label: 'Dark', value: 'Dark' },
  { label: 'AMOLED', value: 'Amoled' },
  { label: 'System', value: 'System' },
];

const AppSettingsScreen: React.FC<AppSettingsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [formEnabled, formDisabled, textPrimary] = useCSSVariable([
    '--color-form-enabled',
    '--color-form-disabled',
    '--color-text-primary',
  ]) as [string, string, string];

  const appTheme = useThemePreference();
  const hapticsEnabled = useHapticsEnabled();
  const soundsEnabled = useSoundsEnabled();
  const notificationsEnabled = useNotificationsEnabled();
  const liquidGlassEnabled = useLiquidGlassTabBarEnabled();
  const supportsLiquidGlassTabBar = supportsNativeIOSTabs(
    Platform.OS,
    Platform.Version,
  );

  return (
    <View className="flex-1 bg-background" style={Platform.OS === 'ios' ? undefined : { paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
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
            <Icon name="chevron-back" size={22} color={textPrimary} />
          </Button>
          <Text className="text-2xl font-bold text-text-primary">App Settings</Text>
        </View>
        )}

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-text-primary">Theme</Text>
            <BottomSheetPicker
              value={appTheme}
              options={themeOptions}
              onSelect={setThemePreference}
              title="Theme"
              containerStyle={{ flex: 1, maxWidth: 200 }}
            />
          </View>
        </View>
        {supportsLiquidGlassTabBar && (
          <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
            <View className="flex-row justify-between items-center">
              <Text className="text-base text-text-primary">Liquid Glass tab bar</Text>
              <Switch
                value={liquidGlassEnabled}
                onValueChange={setLiquidGlassTabBarEnabled}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
              />
            </View>
            <Text className="text-text-secondary text-sm mt-2">
              Use the iOS 26 glass tab bar.
            </Text>
          </View>
        )}
        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-text-primary">Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Text className="text-text-secondary text-sm mt-2">
            Alerts for workout rest timers and fasting goals.
          </Text>
        </View>

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-text-primary">Haptic Feedback</Text>
            <Switch
              value={hapticsEnabled}
              onValueChange={setHapticsEnabled}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Text className="text-text-secondary text-sm mt-2">
            Light vibrations for timers and confirmations.
          </Text>
        </View>

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-text-primary">Camera shutter</Text>
            <Switch
              value={soundsEnabled}
              onValueChange={setSoundsEnabled}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Text className="text-text-secondary text-sm mt-2">
            Play a sound when capturing photos.
          </Text>
        </View>


      </ScrollView>
    </View>
  );
};

export default AppSettingsScreen;
