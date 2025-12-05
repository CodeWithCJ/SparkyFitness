import React, { useState } from 'react';
import { View, Text, Image } from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';
import styles from '../screens/SettingsScreenStyles';

const AppearanceSettings = ({ appTheme, setAppTheme }) => {
  const [themeOpen, setThemeOpen] = useState(false);

  const themeItems = [
    { label: 'Light', value: 'Light' },
    { label: 'Dark', value: 'Dark' },
    { label: 'AMOLED', value: 'Amoled' },
    { label: 'System', value: 'System' },
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Appearance</Text>
      <View style={[styles.settingItem, { zIndex: 1000 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Image source={require('../../assets/icons/settings.png')} style={styles.icon} />
          <Text style={[styles.settingLabel, { marginLeft: 8 }]}>Theme</Text>
        </View>
        <DropDownPicker
          open={themeOpen}
          value={appTheme}
          items={themeItems}
          setOpen={setThemeOpen}
          setValue={setAppTheme}
          listMode="SCROLLVIEW"
          containerStyle={{ flex: 1 }}
          placeholder="Select a theme"
        />
      </View>
    </View>
  );
};

export default AppearanceSettings;