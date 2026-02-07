import React from 'react';
import { View, Text, Switch } from 'react-native';
import styles from '../screens/SettingsScreenStyles';
import { useTheme } from '../contexts/ThemeContext';

interface SyncFrequencyProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
}

const SyncFrequency: React.FC<SyncFrequencyProps> = ({ isEnabled, onToggle }) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Background Sync</Text>
      <View style={styles.settingItem}>
        <Text style={[styles.settingLabel, { color: colors.text }]}>Enable Background Sync</Text>
        <Switch
          onValueChange={onToggle}
          value={isEnabled}
          trackColor={{ false: colors.inputBackground, true: colors.primary }}
          thumbColor="#FFFFFF"
        />
      </View>
    </View>
  );
};

export default SyncFrequency;
