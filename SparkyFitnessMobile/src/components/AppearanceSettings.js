import React from 'react';
import { View, Text, Image } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import styles from '../screens/SettingsScreenStyles';

const AppearanceSettings = ({ appTheme, handleThemeChange }) => {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Appearance</Text>
      <View style={styles.settingItem}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Image source={require('../../assets/icons/settings.png')} style={styles.icon} />
          <Text style={[styles.settingLabel, { marginLeft: 8 }]}>Theme</Text>
        </View>
        <Picker
          selectedValue={appTheme}
          style={styles.picker}
          onValueChange={handleThemeChange}
          itemStyle={styles.pickerItem}
        >
          <Picker.Item label="Light" value="Light" />
          <Picker.Item label="Dark" value="Dark" />
          <Picker.Item label="AMOLED" value="Amoled" />
          <Picker.Item label="System" value="System" />
        </Picker>
      </View>
    </View>
  );
};

export default AppearanceSettings;