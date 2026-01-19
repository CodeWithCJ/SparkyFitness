import React from 'react';
import { View, Text } from 'react-native';
import styles from '../screens/SettingsScreenStyles';
import BottomSheetPicker from './BottomSheetPicker';
import { useTheme } from '../contexts/ThemeContext';

type ThemePreference = 'Light' | 'Dark' | 'Amoled' | 'System';

interface AppearanceSettingsProps {
  appTheme: ThemePreference;
  setAppTheme: (theme: ThemePreference) => void;
}

const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({ appTheme, setAppTheme }) => {
  const { colors } = useTheme();

  const themeOptions = [
    { label: 'Light', value: 'Light' as ThemePreference },
    { label: 'Dark', value: 'Dark' as ThemePreference },
    { label: 'AMOLED', value: 'Amoled' as ThemePreference },
    { label: 'System', value: 'System' as ThemePreference },
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Appearance</Text>
      <View style={styles.settingItem}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Theme</Text>
        </View>
        <BottomSheetPicker
          value={appTheme}
          options={themeOptions}
          onSelect={setAppTheme}
          title="Theme"
          containerStyle={{ flex: 1, maxWidth: 200 }}
        />
      </View>
    </View>
  );
};

export default AppearanceSettings;
