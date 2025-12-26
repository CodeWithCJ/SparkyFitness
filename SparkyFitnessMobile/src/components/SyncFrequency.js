import React, { useState } from 'react';
import { View, Text } from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';
import styles from '../screens/SettingsScreenStyles';
import { saveSyncDuration, saveStringPreference } from '../services/healthConnectService';

import { useTheme } from '../contexts/ThemeContext';

const SyncFrequency = ({ syncDuration, setSyncDuration, fourHourSyncTime, setFourHourSyncTime, dailySyncTime, setDailySyncTime }) => {
  const [syncDurationOpen, setSyncDurationOpen] = useState(false);
  const [fourHourTimeOpen, setFourHourTimeOpen] = useState(false);
  const [dailyTimeOpen, setDailyTimeOpen] = useState(false);
  const { colors, isDarkMode } = useTheme();

  const syncDurationItems = [
    { label: 'Hourly', value: '1h' },
    { label: 'Every 4 Hours', value: '4h' },
    { label: 'Daily', value: '24h' },
  ];

  const fourHourTimeItems = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'].map(time => ({ label: time, value: time }));

  const dailyTimeItems = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, '0');
    return { label: `${hour}:00`, value: `${hour}:00` };
  });

  const onSyncDurationOpen = (open) => {
    if (open) {
      setFourHourTimeOpen(false);
      setDailyTimeOpen(false);
    }
  };

  const onFourHourTimeOpen = (open) => {
    if (open) {
      setSyncDurationOpen(false);
      setDailyTimeOpen(false);
    }
  };

  const onDailyTimeOpen = (open) => {
    if (open) {
      setSyncDurationOpen(false);
      setFourHourTimeOpen(false);
    }
  };

  const dropdownProps = {
    listMode: "SCROLLVIEW",
    style: { backgroundColor: colors.inputBackground, borderColor: colors.border },
    textStyle: { color: colors.text },
    dropDownContainerStyle: { backgroundColor: colors.card, borderColor: colors.border },
    theme: isDarkMode ? "DARK" : "LIGHT"
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Sync Frequency</Text>

      <View style={[styles.inputGroup, { zIndex: 3000 }]}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Sync Interval</Text>
        <DropDownPicker
          open={syncDurationOpen}
          value={syncDuration}
          items={syncDurationItems}
          setOpen={setSyncDurationOpen}
          onOpen={() => onSyncDurationOpen(true)}
          setValue={setSyncDuration}
          onSelectItem={(item) => saveSyncDuration(item.value)}
          placeholder="Select sync frequency"
          {...dropdownProps}
        />
        <Text style={[styles.subLabel, { color: colors.textMuted }]}>How often should your health data be synced automatically?</Text>
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
            onSelectItem={(item) => saveStringPreference('fourHourSyncTime', item.value)}
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
            onSelectItem={(item) => saveStringPreference('dailySyncTime', item.value)}
            placeholder="Select a time"
            {...dropdownProps}
          />
        </View>
      )}
    </View>
  );
};

export default SyncFrequency;