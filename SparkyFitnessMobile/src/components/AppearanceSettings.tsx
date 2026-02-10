import React from 'react';
import { View, Text } from 'react-native';
import BottomSheetPicker from './BottomSheetPicker';
import { useThemePreference, setThemePreference, type ThemePreference } from '../services/themeService';

const themeOptions = [
  { label: 'Light', value: 'Light' as ThemePreference },
  { label: 'Dark', value: 'Dark' as ThemePreference },
  { label: 'AMOLED', value: 'Amoled' as ThemePreference },
  { label: 'System', value: 'System' as ThemePreference },
];

const AppearanceSettings: React.FC = () => {
  const appTheme = useThemePreference();

  const handleThemeChange = (theme: ThemePreference) => {
    setThemePreference(theme);
  };

  return (
    <View className="bg-section rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-lg font-bold mb-3 text-text-primary">Appearance</Text>
      <View className="flex-row justify-between items-center mb-2">
        <View className="flex-row items-center">
          <Text className="text-base text-text-primary">Theme</Text>
        </View>
        <BottomSheetPicker
          value={appTheme}
          options={themeOptions}
          onSelect={handleThemeChange}
          title="Theme"
          containerStyle={{ flex: 1, maxWidth: 200 }}
        />
      </View>
    </View>
  );
};

export default AppearanceSettings;
