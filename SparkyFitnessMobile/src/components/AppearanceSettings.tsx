import React, { useState } from 'react';
import { View, Text } from 'react-native';
import DropDownPicker, { ItemType } from 'react-native-dropdown-picker';
import styles from '../screens/SettingsScreenStyles';

import { useTheme } from '../contexts/ThemeContext';

type ThemePreference = 'Light' | 'Dark' | 'Amoled' | 'System';

interface AppearanceSettingsProps {
  appTheme: ThemePreference;
  setAppTheme: (theme: ThemePreference) => void;
}

const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({ appTheme, setAppTheme }) => {
  const [themeOpen, setThemeOpen] = useState(false);
  const { colors, isDarkMode } = useTheme();

  const themeItems: ItemType<ThemePreference>[] = [
    { label: 'Light', value: 'Light' },
    { label: 'Dark', value: 'Dark' },
    { label: 'AMOLED', value: 'Amoled' },
    { label: 'System', value: 'System' },
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.card, zIndex: 1000 }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Appearance</Text>
      <View style={[styles.settingItem, { zIndex: 4000 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Theme</Text>
        </View>
        <DropDownPicker
          open={themeOpen}
          value={appTheme}
          items={themeItems}
          setOpen={setThemeOpen}
          setValue={(callback) => {
            const newValue = typeof callback === 'function' ? callback(appTheme) : callback;
            if (newValue && newValue !== appTheme) {
              setAppTheme(newValue);
            }
          }}
          listMode="SCROLLVIEW"
          containerStyle={{ flex: 1, maxWidth: 200, zIndex: 4000 }}
          style={{ backgroundColor: colors.inputBackground, borderColor: colors.border }}
          textStyle={{ color: colors.text }}
          dropDownContainerStyle={{ backgroundColor: colors.card, borderColor: colors.border }}
          placeholder="Select a theme"
          theme={isDarkMode ? "DARK" : "LIGHT"}
          dropDownDirection="BOTTOM"
        />
      </View>
    </View>
  );
};

export default AppearanceSettings;
