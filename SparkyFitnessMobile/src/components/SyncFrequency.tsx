import React from 'react';
import { View, Text } from 'react-native';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import styles from '../screens/SettingsScreenStyles';
import { saveSyncDuration, saveStringPreference } from '../services/healthConnectService';
import type { SyncInterval } from '../services/healthconnect/preferences';
import BottomSheetPicker from './BottomSheetPicker';
import { useTheme } from '../contexts/ThemeContext';

interface SyncFrequencyProps {
  syncDuration: SyncInterval;
  setSyncDuration: React.Dispatch<React.SetStateAction<SyncInterval>>;
  fourHourSyncTime: string;
  setFourHourSyncTime: React.Dispatch<React.SetStateAction<string>>;
  dailySyncTime: string;
  setDailySyncTime: React.Dispatch<React.SetStateAction<string>>;
}

const SYNC_INTERVAL_VALUES: SyncInterval[] = ['1h', '4h', '24h'];
const SYNC_INTERVAL_LABELS = ['Hourly', '4 Hours', 'Daily'];

const SyncFrequency: React.FC<SyncFrequencyProps> = ({
  syncDuration,
  setSyncDuration,
  fourHourSyncTime,
  setFourHourSyncTime,
  dailySyncTime,
  setDailySyncTime,
}) => {
  const { colors } = useTheme();

  const fourHourTimeItems = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'].map(time => ({ label: time, value: time }));

  const dailyTimeItems = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, '0');
    return { label: `${hour}:00`, value: `${hour}:00` };
  });

  const selectedSyncIndex = SYNC_INTERVAL_VALUES.indexOf(syncDuration);

  const handleSyncIntervalChange = (index: number) => {
    const newValue = SYNC_INTERVAL_VALUES[index];
    setSyncDuration(newValue);
    saveSyncDuration(newValue);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Background Sync Frequency</Text>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Sync Interval</Text>
        <SegmentedControl
          values={SYNC_INTERVAL_LABELS}
          selectedIndex={selectedSyncIndex}
          onChange={(event) => handleSyncIntervalChange(event.nativeEvent.selectedSegmentIndex)}
          backgroundColor={colors.inputBackground}
          tintColor={colors.primary}
          fontStyle={{ color: colors.textSecondary }}
          activeFontStyle={{ color: '#FFFFFF' }}
          style={[styles.segmented]}
        />
      </View>

      {syncDuration === '4h' && (
        <View style={styles.settingItem}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Sync Time</Text>
          <BottomSheetPicker
            value={fourHourSyncTime}
            options={fourHourTimeItems}
            onSelect={(value) => {
              setFourHourSyncTime(value);
              saveStringPreference('fourHourSyncTime', value);
            }}
            title="Sync Time"
            containerStyle={{ flex: 1, maxWidth: 200 }}
          />
        </View>
      )}

      {syncDuration === '24h' && (
        <View style={styles.settingItem}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Sync Time</Text>
          <BottomSheetPicker
            value={dailySyncTime}
            options={dailyTimeItems}
            onSelect={(value) => {
              setDailySyncTime(value);
              saveStringPreference('dailySyncTime', value);
            }}
            title="Sync Time"
            containerStyle={{ flex: 1, maxWidth: 200 }}
          />
        </View>
      )}
    </View>
  );
};

export default SyncFrequency;
