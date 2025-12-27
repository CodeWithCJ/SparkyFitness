import React, { useState } from 'react';
import { View, Text, Image } from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';
import styles from '../screens/SettingsScreenStyles';

import { useTheme } from '../contexts/ThemeContext';

const AppearanceSettings = ({ appTheme, setAppTheme }) => {
  const [themeOpen, setThemeOpen] = useState(false);
  const { colors, isDarkMode } = useTheme();

  const themeItems = [
    { label: 'Light', value: 'Light' },
    { label: 'Dark', value: 'Dark' },
    { label: 'AMOLED', value: 'Amoled' },
    { label: 'System', value: 'System' },
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Appearance</Text>
      <View style={[styles.settingItem, { zIndex: 1000 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Image source={require('../../assets/icons/settings.png')} style={[styles.icon, { tintColor: colors.text }]} />
          <Text style={[styles.settingLabel, { marginLeft: 8, color: colors.text }]}>Theme</Text>
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
          containerStyle={{ flex: 1, maxWidth: 200 }}
          style={{ backgroundColor: colors.inputBackground, borderColor: colors.border }}
          textStyle={{ color: colors.text }}
          dropDownContainerStyle={{ backgroundColor: colors.card, borderColor: colors.border }}
          placeholder="Select a theme"
          theme={isDarkMode ? "DARK" : "LIGHT"}
        />
      </View>
    </View>
  );
};

export default AppearanceSettings;