import React, { useState } from 'react';
import { View, Text } from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';
import styles from '../screens/SettingsScreenStyles';
import { saveSyncDuration, saveStringPreference } from '../services/healthConnectService';
// Import type directly from preferences module (type is identical in both platform variants)
import type { SyncInterval } from '../services/healthconnect/preferences';

import { useTheme } from '../contexts/ThemeContext';

interface SyncDurationItem {
  label: string;
  value: SyncInterval;
}

interface SyncFrequencyProps {
  syncDuration: SyncInterval;
  setSyncDuration: React.Dispatch<React.SetStateAction<SyncInterval>>;
  fourHourSyncTime: string;
  setFourHourSyncTime: React.Dispatch<React.SetStateAction<string>>;
  dailySyncTime: string;
  setDailySyncTime: React.Dispatch<React.SetStateAction<string>>;
}

const SyncFrequency: React.FC<SyncFrequencyProps> = ({
  syncDuration,
  setSyncDuration,
  fourHourSyncTime,
  setFourHourSyncTime,
  dailySyncTime,
  setDailySyncTime,
}) => {
  const [syncDurationOpen, setSyncDurationOpen] = useState<boolean>(false);
  const [fourHourTimeOpen, setFourHourTimeOpen] = useState<boolean>(false);
  const [dailyTimeOpen, setDailyTimeOpen] = useState<boolean>(false);
  const { colors, isDarkMode } = useTheme();

  const syncDurationItems: SyncDurationItem[] = [
    { label: 'Hourly', value: '1h' },
    { label: 'Every 4 Hours', value: '4h' },
    { label: 'Daily', value: '24h' },
  ];

  const fourHourTimeItems = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'].map(time => ({ label: time, value: time }));

  const dailyTimeItems = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, '0');
    return { label: `${hour}:00`, value: `${hour}:00` };
  });

  const onSyncDurationOpen = (open: boolean) => {
    if (open) {
      setFourHourTimeOpen(false);
      setDailyTimeOpen(false);
    }
  };

  const onFourHourTimeOpen = (open: boolean) => {
    if (open) {
      setSyncDurationOpen(false);
      setDailyTimeOpen(false);
    }
  };

  const onDailyTimeOpen = (open: boolean) => {
    if (open) {
      setSyncDurationOpen(false);
      setFourHourTimeOpen(false);
    }
  };

  const dropdownProps = {
    listMode: "SCROLLVIEW" as const,
    style: { backgroundColor: colors.inputBackground, borderColor: colors.border },
    textStyle: { color: colors.text },
    dropDownContainerStyle: { backgroundColor: colors.card, borderColor: colors.border },
    theme: isDarkMode ? "DARK" as const : "LIGHT" as const
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, zIndex: 2000 }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Background Sync Frequency</Text>

      <View style={[styles.inputGroup, { zIndex: 3000 }]}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Sync Interval</Text>
        <DropDownPicker
          open={syncDurationOpen}
          value={syncDuration}
          items={syncDurationItems}
          setOpen={setSyncDurationOpen}
          onOpen={() => onSyncDurationOpen(true)}
          setValue={setSyncDuration}
          onSelectItem={(item) => saveSyncDuration(item.value as SyncInterval)}
          placeholder="Select sync frequency"
          {...dropdownProps}
        />
      </View>

      {syncDuration === '4h' && (
        <View style={[styles.inputGroup, { zIndex: 2000 }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Prompt Time (Every 4 Hours)</Text>
          <DropDownPicker
            open={fourHourTimeOpen}
            value={fourHourSyncTime}
            items={fourHourTimeItems}
            setOpen={setFourHourTimeOpen}
            onOpen={() => onFourHourTimeOpen(true)}
            setValue={setFourHourSyncTime}
            onSelectItem={(item) => item.value && saveStringPreference('fourHourSyncTime', item.value)}
            placeholder="Select a time"
            {...dropdownProps}
          />
        </View>
      )}

      {syncDuration === '24h' && (
        <View style={[styles.inputGroup, { zIndex: 1000 }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Prompt Time (Daily)</Text>
          <DropDownPicker
            open={dailyTimeOpen}
            value={dailySyncTime}
            items={dailyTimeItems}
            setOpen={setDailyTimeOpen}
            onOpen={() => onDailyTimeOpen(true)}
            setValue={setDailySyncTime}
            onSelectItem={(item) => item.value && saveStringPreference('dailySyncTime', item.value)}
            placeholder="Select a time"
            {...dropdownProps}
          />
        </View>
      )}
    </View>
  );
};

export default SyncFrequency;
