import React from 'react';
import { View, Text, ScrollView, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import BottomSheetPicker from '../components/BottomSheetPicker';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import {
  useThemePreference,
  setThemePreference,
  type ThemePreference,
} from '../services/themeService';
import { setNotificationsEnabled } from '../services/notifications';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { canUseLiquidGlass } from '../utils/liquidGlass';
import type { RootStackScreenProps } from '../types/navigation';
import { mobileT } from '../localization';

type AppSettingsScreenProps = RootStackScreenProps<'AppSettings'>;

const themeOptions: { label: string; value: ThemePreference }[] = [
  { label: mobileT('appSettings.themeLight'), value: 'Light' },
  { label: mobileT('appSettings.themeDark'), value: 'Dark' },
  { label: mobileT('appSettings.themeAmoled'), value: 'Amoled' },
  { label: mobileT('appSettings.themeSystem'), value: 'System' },
];

const AppSettingsScreen: React.FC<AppSettingsScreenProps> = () => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [formEnabled, formDisabled] = useCSSVariable([
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string];

  const appTheme = useThemePreference();
  const hapticsEnabled = useAppPreferencesStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useAppPreferencesStore((s) => s.setHapticsEnabled);
  const soundsEnabled = useAppPreferencesStore((s) => s.soundsEnabled);
  const setSoundsEnabled = useAppPreferencesStore((s) => s.setSoundsEnabled);
  const notificationsEnabled = useAppPreferencesStore((s) => s.notificationsEnabled);
  const liquidGlassEnabled = useAppPreferencesStore((s) => s.liquidGlassTabBarEnabled);
  const setLiquidGlassTabBarEnabled = useAppPreferencesStore(
    (s) => s.setLiquidGlassTabBarEnabled,
  );
  const supportsLiquidGlassTabBar = canUseLiquidGlass();
  const usesNativeHeader = useNativeIOSHeadersActive();

  const header = useScreenHeader({
    title: mobileT('screens.appSettings'),
    left: { kind: 'back' },
  });

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}
      >

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-text-primary">
              {mobileT('appSettings.theme')}
            </Text>
            <BottomSheetPicker
              value={appTheme}
              options={themeOptions}
              onSelect={setThemePreference}
              title={mobileT('appSettings.theme')}
              containerStyle={{ flex: 1, maxWidth: 200 }}
            />
          </View>
        </View>
        {supportsLiquidGlassTabBar && (
          <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
            <View className="flex-row justify-between items-center">
              <Text className="text-base text-text-primary">
                {mobileT('appSettings.liquidGlass')}
              </Text>
              <Switch
                value={liquidGlassEnabled}
                onValueChange={setLiquidGlassTabBarEnabled}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
                accessibilityLabel={mobileT('appSettings.liquidGlass')}
              />
            </View>
            <Text className="text-text-secondary text-sm mt-2">
              {mobileT('appSettings.liquidGlassDescription')}
            </Text>
          </View>
        )}
        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-text-primary">
              {mobileT('appSettings.notifications')}
            </Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
              accessibilityLabel={mobileT('appSettings.notifications')}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-2">
            {mobileT('appSettings.notificationsDescription')}
          </Text>
        </View>

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-text-primary">
              {mobileT('appSettings.haptics')}
            </Text>
            <Switch
              value={hapticsEnabled}
              onValueChange={setHapticsEnabled}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
              accessibilityLabel={mobileT('appSettings.haptics')}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-2">
            {mobileT('appSettings.hapticsDescription')}
          </Text>
        </View>

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-text-primary">
              {mobileT('appSettings.cameraSound')}
            </Text>
            <Switch
              value={soundsEnabled}
              onValueChange={setSoundsEnabled}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
              accessibilityLabel={mobileT('appSettings.cameraSound')}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-2">
            {mobileT('appSettings.cameraSoundDescription')}
          </Text>
        </View>


      </ScrollView>
    </View>
  );
};

export default AppSettingsScreen;
