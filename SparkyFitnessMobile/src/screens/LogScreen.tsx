import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import Button from '../components/ui/Button';
import Clipboard from '@react-native-clipboard/clipboard';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import {
  getLogs,
  clearLogs,
  getViewSelectedStatuses,
  setViewSelectedStatuses,
} from '../services/LogService';
import type { LogEntry, LogStatus } from '../services/LogService';
import type { RootStackScreenProps } from '../types/navigation';

type LogScreenProps = RootStackScreenProps<'Logs'>;

const MAX_LOGS_TO_LOAD = 1000;
const LEVEL_CHIPS: { status: LogStatus; label: string; color: string }[] = [
  { status: 'INFO', label: 'Info', color: '#007bff' },
  { status: 'WARNING', label: 'Warning', color: '#ffc107' },
  { status: 'ERROR', label: 'Error', color: '#dc3545' },
  { status: 'DEBUG', label: 'Debug', color: '#6c757d' },
];

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'WARNING': return '#ffc107';
    case 'INFO': return '#007bff';
    case 'DEBUG': return '#6c757d';
    default: return '#dc3545';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'WARNING': return require('../../assets/icons/warning.png');
    case 'INFO': return require('../../assets/icons/info.png');
    default: return require('../../assets/icons/error.png');
  }
};

interface FilterChipProps {
  label: string;
  count: number;
  active: boolean;
  color?: string;
  onPress: () => void;
}

const FilterChip: React.FC<FilterChipProps> = ({ label, count, active, color, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    className={`flex-row items-center rounded-full px-3 py-1.5 mr-2 mb-2 border ${
      active
        ? 'bg-raised border-border-strong'
        : 'bg-transparent border-border-subtle'
    }`}
  >
    {color && (
      <View
        className="w-2 h-2 rounded-full mr-2"
        style={{ backgroundColor: color }}
      />
    )}
    <Text
      className={`text-sm font-medium ${
        active ? 'text-text-primary' : 'text-text-secondary'
      }`}
    >
      {label}
    </Text>
    <Text
      className={`text-sm ml-1.5 ${
        active ? 'text-text-primary' : 'text-text-secondary'
      }`}
    >
      {count}
    </Text>
  </TouchableOpacity>
);

const LogScreen: React.FC<LogScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<LogStatus[]>([]);

  const loadLogs = async (): Promise<void> => {
    const stored = await getLogs(0, MAX_LOGS_TO_LOAD, 'all');
    setLogs(stored);
  };

  const loadSelectedStatuses = async (): Promise<void> => {
    const stored = await getViewSelectedStatuses();
    setSelectedStatuses(stored);
  };

  useFocusEffect(
    useCallback(() => {
      loadLogs();
      loadSelectedStatuses();
    }, [])
  );

  const persistSelection = async (next: LogStatus[]): Promise<void> => {
    setSelectedStatuses(next);
    try {
      await setViewSelectedStatuses(next);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to save log filter.' });
      console.error('Failed to persist log filter selection', error);
    }
  };

  const handleSelectAll = (): void => {
    if (selectedStatuses.length === 0) return;
    persistSelection([]);
  };

  const handleToggleStatus = (status: LogStatus): void => {
    const next = selectedStatuses.includes(status)
      ? selectedStatuses.filter(s => s !== status)
      : [...selectedStatuses, status];
    persistSelection(next);
  };

  const handleClearLogs = useCallback((): void => {
    Alert.alert(
      'Clear Logs',
      'Are you sure you want to clear all logs?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          onPress: async () => {
            await clearLogs();
            setLogs([]);
          },
        },
      ],
      { cancelable: true },
    );
  }, []);

  const hasLogs = logs.length > 0;
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Button
          variant="header"
          className="pr-4"
          onPress={handleClearLogs}
          disabled={!hasLogs}
        >
          Clear
        </Button>
      ),
    });
  }, [navigation, handleClearLogs, hasLogs]);

  const handleCopyLogToClipboard = (item: LogEntry): void => {
    let logText = `Status: ${item.status}\n`;
    logText += `Message: ${item.message}\n`;

    if (item.details && item.details.length > 0) {
      logText += `Details: ${item.details.join(', ')}\n`;
    }

    logText += `Timestamp: ${new Date(item.timestamp).toLocaleString()}`;

    Clipboard.setString(logText);

    Toast.show({ type: 'success', text1: 'Copied', text2: 'Log entry copied to clipboard' });
  };

  const counts = useMemo(() => {
    const c: Record<LogStatus, number> = { DEBUG: 0, INFO: 0, WARNING: 0, ERROR: 0 };
    for (const log of logs) {
      c[log.status]++;
    }
    return c;
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (selectedStatuses.length === 0) return logs;
    return logs.filter(log => selectedStatuses.includes(log.status));
  }, [logs, selectedStatuses]);

  const allActive = selectedStatuses.length === 0;

  const ListHeader = (
    <View className="flex-row flex-wrap mb-2">
      <FilterChip
        label="All"
        count={logs.length}
        active={allActive}
        onPress={handleSelectAll}
      />
      {LEVEL_CHIPS.map(chip => (
        <FilterChip
          key={chip.status}
          label={chip.label}
          count={counts[chip.status]}
          active={selectedStatuses.includes(chip.status)}
          color={chip.color}
          onPress={() => handleToggleStatus(chip.status)}
        />
      ))}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={filteredLogs}
        ListHeaderComponent={ListHeader}
        renderItem={({ item }: { item: LogEntry }) => (
          <TouchableOpacity
            className="bg-surface rounded-xl p-4 mb-3 flex-row items-center w-full shadow-sm"
            onPress={() => handleCopyLogToClipboard(item)}
            activeOpacity={0.7}
          >
            <View
              className="mr-3 p-2 rounded-[20px] items-center justify-center"
              style={{ backgroundColor: getStatusColor(item.status) }}
            >
              <Image
                source={getStatusIcon(item.status)}
                className="w-6 h-6"
                style={{ tintColor: '#fff' }}
              />
            </View>
            <View className="flex-1 shrink w-full">
              <Text
                className="text-base font-bold mb-1"
                style={{ color: getStatusColor(item.status) }}
              >
                {item.status}
              </Text>
              <Text className="text-sm mb-1 flex-wrap w-full text-text-primary" ellipsizeMode="clip">
                {item.message}
              </Text>
              <View className="flex-row flex-wrap mb-1">
                {item.details &&
                  item.details.map((detail, index) => (
                    <Text key={index} className="bg-raised rounded px-2 py-1 mr-2 mb-1 text-sm text-text-primary">
                      {detail}
                    </Text>
                  ))}
              </View>
              <Text className="text-sm text-text-muted">
                {new Date(item.timestamp).toLocaleString()}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        keyExtractor={(item, index) => `${item.timestamp}-${index}`}
        ListEmptyComponent={() => (
          <View className="items-center py-8">
            <Text className="text-text-muted text-base">
              {logs.length === 0 ? 'No logs yet.' : 'No logs match the current filter.'}
            </Text>
          </View>
        )}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
      />
    </View>
  );
};

export default LogScreen;
