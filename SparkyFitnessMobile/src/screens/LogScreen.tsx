import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheetPicker from '../components/BottomSheetPicker';
import {
  getLogs,
  clearLogs,
  getLogSummary,
  getLogFilter,
  setLogFilter,
  LOG_FILTER_OPTIONS,
} from '../services/LogService';
import type { LogEntry, LogSummary, LogFilter } from '../services/LogService';

interface LogScreenProps {
  navigation: { navigate: (screen: string) => void };
}

const LogScreen: React.FC<LogScreenProps> = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [offset, setOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [logSummary, setLogSummary] = useState<LogSummary>({
    DEBUG: 0,
    INFO: 0,
    SUCCESS: 0,
    WARNING: 0,
    ERROR: 0,
  });
  const [currentFilter, setCurrentFilter] = useState<LogFilter>('no_debug');

  const LOG_LIMIT = 30;

  const loadLogs = async (newOffset = 0, append = false): Promise<void> => {
    const storedLogs = await getLogs(newOffset, LOG_LIMIT);
    if (append) {
      setLogs(prevLogs => [...prevLogs, ...storedLogs]);
    } else {
      setLogs(storedLogs);
    }
    setOffset(newOffset + storedLogs.length);
    setHasMore(storedLogs.length === LOG_LIMIT);
  };

  const loadSummary = async (): Promise<void> => {
    const summary = await getLogSummary();
    setLogSummary(summary);
  };

  const loadFilter = async (): Promise<void> => {
    const filter = await getLogFilter();
    setCurrentFilter(filter);
  };

  useFocusEffect(
    useCallback(() => {
      loadLogs();
      loadSummary();
      loadFilter();
    }, [])
  );

  const handleLoadMore = (): void => {
    if (hasMore) {
      loadLogs(offset, true);
    }
  };

  const handleClearLogs = async (): Promise<void> => {
    Alert.alert(
      'Clear Logs',
      'Are you sure you want to clear all logs?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          onPress: async () => {
            await clearLogs();
            setLogs([]);
            setOffset(0);
            setHasMore(true);
            setLogSummary({
              DEBUG: 0,
              INFO: 0,
              SUCCESS: 0,
              WARNING: 0,
              ERROR: 0,
            });
          },
        },
      ],
      { cancelable: true },
    );
  };

  const handleFilterChange = async (filter: LogFilter): Promise<void> => {
    if (filter && filter !== currentFilter) {
      try {
        await setLogFilter(filter);
        setCurrentFilter(filter);
        loadLogs(0, false);
        loadSummary();
      } catch (error) {
        Alert.alert('Error', 'Failed to save log filter settings.');
        console.error('Failed to save log filter settings:', error);
      }
    }
  };

  const handleCopyLogToClipboard = (item: LogEntry): void => {
    let logText = `Status: ${item.status}\n`;
    logText += `Message: ${item.message}\n`;

    if (item.details && item.details.length > 0) {
      logText += `Details: ${item.details.join(', ')}\n`;
    }

    logText += `Timestamp: ${new Date(item.timestamp).toLocaleString()}`;

    Clipboard.setString(logText);

    Alert.alert('Copied', 'Log entry copied to clipboard');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS': return '#28a745';
      case 'WARNING': return '#ffc107';
      case 'INFO': return '#007bff';
      case 'DEBUG': return '#6c757d';
      default: return '#dc3545';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS': return require('../../assets/icons/success.png');
      case 'WARNING': return require('../../assets/icons/warning.png');
      case 'INFO': return require('../../assets/icons/info.png');
      default: return require('../../assets/icons/error.png');
    }
  };

  return (
    <View className="flex-1 bg-canvas">
      <View className="p-4 pb-0 z-100">
        {/* Today's Summary */}
        <View className="bg-section rounded-xl p-4 py-2.5 mb-2.5 shadow-sm">
          <Text className="text-lg font-bold mb-3 text-text-primary">
            {"Today's Summary"}
          </Text>
          <View className="flex-row justify-around mb-4">
            <View className="items-center">
              <Text className="text-2xl font-bold" style={{ color: '#28a745' }}>
                {logSummary.SUCCESS}
              </Text>
              <Text className="text-sm text-text-secondary">Success</Text>
            </View>
            <View className="items-center">
              <Text className="text-2xl font-bold" style={{ color: '#ffc107' }}>
                {logSummary.WARNING}
              </Text>
              <Text className="text-sm text-text-secondary">Warning</Text>
            </View>
            <View className="items-center">
              <Text className="text-2xl font-bold" style={{ color: '#dc3545' }}>
                {logSummary.ERROR}
              </Text>
              <Text className="text-sm text-text-secondary">Error</Text>
            </View>
            <View className="items-center">
              <Text className="text-2xl font-bold" style={{ color: '#007bff' }}>
                {logSummary.INFO}
              </Text>
              <Text className="text-sm text-text-secondary">Info</Text>
            </View>
            <View className="items-center">
              <Text className="text-2xl font-bold" style={{ color: '#6c757d' }}>
                {logSummary.DEBUG}
              </Text>
              <Text className="text-sm text-text-secondary">Debug</Text>
            </View>
          </View>
        </View>

        {/* Log Filter Settings */}
        <View className="bg-section rounded-xl p-4 mb-4 shadow-sm">
          <Text className="text-lg font-bold mb-3 text-text-primary">Log Filter</Text>
          <View className="flex-row justify-between items-center">
            <BottomSheetPicker
              value={currentFilter}
              options={LOG_FILTER_OPTIONS}
              onSelect={handleFilterChange}
              title="Log Filter"
              containerStyle={{ flex: 1, maxWidth: '50%' }}
            />
            {/* Clear Logs Button */}
            <TouchableOpacity
              className="bg-bg-danger rounded-lg py-3 px-6 self-center"
              onPress={handleClearLogs}
            >
              <Text className="text-white text-base font-bold">Clear All Logs</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <FlatList
        data={logs}
        renderItem={({ item }: { item: LogEntry }) => (
          <TouchableOpacity
            className="bg-section rounded-xl p-4 mb-3 flex-row items-center w-full shadow-sm"
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
                    <Text key={index} className="bg-card rounded px-2 py-1 mr-2 mb-1 text-sm text-text-primary">
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
        keyExtractor={(item, index) => index.toString()}
        ListFooterComponent={() => (
          <>
            {hasMore && (
              <TouchableOpacity
                className="bg-accent-primary rounded-lg p-3 items-center mt-4"
                onPress={handleLoadMore}
              >
                <Text className="text-white text-base font-bold">Load more logs</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 80 }}
      />
    </View>
  );
};

export default LogScreen;
