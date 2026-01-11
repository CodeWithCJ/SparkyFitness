import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import DropDownPicker from 'react-native-dropdown-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getLogs,
  clearLogs,
  getLogSummary,
  getLogLevel,
  setLogLevel,
} from '../services/LogService';
import type { LogEntry, LogSummary, LogLevel } from '../services/LogService';
import { useTheme } from '../contexts/ThemeContext';

interface LogScreenProps {
  navigation: { navigate: (screen: string) => void };
}

const LogScreen: React.FC<LogScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDarkMode } = useTheme();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [offset, setOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [logSummary, setLogSummary] = useState<LogSummary>({
    SUCCESS: 0,
    WARNING: 0,
    ERROR: 0,
    info: 0,
    warn: 0,
    error: 0,
    debug: 0,
  });
  const [currentLogLevel, setCurrentLogLevel] = useState<LogLevel>('info');
  const [logLevelOpen, setLogLevelOpen] = useState<boolean>(false);

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

  const loadLogLevel = async (): Promise<void> => {
    const level = await getLogLevel();
    setCurrentLogLevel(level);
  };

  useFocusEffect(
    useCallback(() => {
      loadLogs();
      loadSummary();
      loadLogLevel();
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
              SUCCESS: 0,
              WARNING: 0,
              ERROR: 0,
              info: 0,
              warn: 0,
              error: 0,
              debug: 0,
            });
          },
        },
      ],
      { cancelable: true },
    );
  };

  const handleLogLevelChange = async (
    valOrFunc: LogLevel | ((prev: LogLevel) => LogLevel)
  ): Promise<void> => {
    const level =
      typeof valOrFunc === 'function' ? valOrFunc(currentLogLevel) : valOrFunc;

    if (level && level !== currentLogLevel) {
      try {
        await setLogLevel(level);
        setCurrentLogLevel(level);
        loadLogs(0, false);
        loadSummary();
      } catch (error) {
        Alert.alert('Error', 'Failed to save log level settings.');
        console.error('Failed to save log level settings:', error);
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

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      <View style={{ padding: 16, paddingBottom: 0, zIndex: 100 }}>
        {/* Today's Summary */}
        <View
          style={[
            styles.card,
            styles.summaryCard,
            { backgroundColor: colors.card },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {"Today's Summary"}
          </Text>
          <View style={styles.summaryContainer}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryCount, { color: '#28a745' }]}>
                {logSummary.SUCCESS}
              </Text>
              <Text
                style={[styles.summaryLabel, { color: colors.textSecondary }]}
              >
                Successful
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryCount, { color: '#ffc107' }]}>
                {logSummary.WARNING}
              </Text>
              <Text
                style={[styles.summaryLabel, { color: colors.textSecondary }]}
              >
                Warnings
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryCount, { color: '#dc3545' }]}>
                {logSummary.ERROR}
              </Text>
              <Text
                style={[styles.summaryLabel, { color: colors.textSecondary }]}
              >
                Errors
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryCount, { color: '#007bff' }]}>
                {logSummary.info}
              </Text>
              <Text
                style={[styles.summaryLabel, { color: colors.textSecondary }]}
              >
                Info
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryCount, { color: '#800080' }]}>
                {logSummary.debug}
              </Text>
              <Text
                style={[styles.summaryLabel, { color: colors.textSecondary }]}
              >
                Debug
              </Text>
            </View>
          </View>
        </View>

        {/* Log Level Settings */}
        <View
          style={[styles.card, { zIndex: 3000, backgroundColor: colors.card }]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Log Level
          </Text>
          <View style={styles.logLevelContent}>
          <DropDownPicker
            open={logLevelOpen}
            value={currentLogLevel}
            items={[
              { label: 'Silent', value: 'silent' as LogLevel },
              { label: 'Error', value: 'error' as LogLevel },
              { label: 'Warning', value: 'warn' as LogLevel },
              { label: 'Info', value: 'info' as LogLevel },
              { label: 'Debug', value: 'debug' as LogLevel },
            ]}
            setOpen={setLogLevelOpen}
            setValue={handleLogLevelChange}
            listMode="SCROLLVIEW"
            containerStyle={styles.dropdownContainer}
            style={[
              styles.dropdownStyle,
              {
                backgroundColor: colors.inputBackground,
                borderColor: colors.border,
              },
            ]}
            textStyle={{ color: colors.text }}
            dropDownContainerStyle={[
              styles.dropdownListContainerStyle,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            labelStyle={[styles.dropdownLabelStyle, { color: colors.text }]}
            placeholderStyle={[
              styles.dropdownPlaceholderStyle,
              { color: colors.textMuted },
            ]}
            selectedItemLabelStyle={styles.selectedItemLabelStyle}
            maxHeight={200}
            zIndex={3000}
            zIndexInverse={1000}
            theme={isDarkMode ? 'DARK' : 'LIGHT'}
          />
          {/* Clear Logs Button */}
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClearLogs}
          >
            <Text style={styles.clearButtonText}>Clear All Logs</Text>
          </TouchableOpacity>
          </View>
        </View>
      </View>

      <FlatList
        data={logs}
        renderItem={({ item }: { item: LogEntry }) => (
          <TouchableOpacity
            style={[styles.logItem, { backgroundColor: colors.card }]}
            onPress={() => handleCopyLogToClipboard(item)}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.logIconContainer,
                {
                  backgroundColor:
                    item.status === 'SUCCESS'
                      ? '#28a745'
                      : item.status === 'WARNING'
                      ? '#ffc107'
                      : item.status === 'INFO'
                      ? '#007bff'
                      : '#dc3545',
                },
              ]}
            >
              <Image
                source={
                  item.status === 'SUCCESS'
                    ? require('../../assets/icons/success.png')
                    : item.status === 'WARNING'
                    ? require('../../assets/icons/warning.png')
                    : require('../../assets/icons/error.png')
                }
                style={styles.logIcon}
              />
            </View>
            <View style={styles.logContent}>
              <Text
                style={[
                  styles.logStatus,
                  {
                    color:
                    item.status === 'SUCCESS'
                      ? '#28a745'
                      : item.status === 'WARNING'
                      ? '#ffc107'
                      : item.status === 'INFO'
                      ? '#007bff'
                      : '#dc3545',
                  },
                ]}
              >
                {item.status}
              </Text>
              <Text style={[styles.logMessage, { color: colors.text }]} ellipsizeMode="clip">
                {item.message}
              </Text>
              <View style={styles.logDetails}>
                {item.details &&
                  item.details.map((detail, index) => (
                    <Text key={index} style={[styles.logDetailTag, { color: colors.text }]}>
                      {detail}
                    </Text>
                  ))}
              </View>
              <Text style={styles.logTimestamp}>
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
                style={styles.loadMoreButton}
                onPress={handleLoadMore}
              >
                <Text style={styles.loadMoreButtonText}>Load more logs</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        contentContainerStyle={styles.flatListContentContainer}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  headerContainer: {
    padding: 16,
    paddingBottom: 0,
    zIndex: 100,
  },
  flatListContentContainer: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 80,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'visible',
    zIndex: 3500,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  dropdownContainer: {
    height: 50,
    zIndex: 4000,
    width: '50%'
  },
  logLevelContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownStyle: {
    backgroundColor: '#fafafa',
    borderColor: '#ddd',
  },
  dropdownItemStyle: {
    justifyContent: 'flex-start',
  },
  dropdownLabelStyle: {
    fontSize: 16,
    color: '#333',
  },
  dropdownListContainerStyle: {
    borderColor: '#ddd',
  },
  dropdownPlaceholderStyle: {
    color: '#999',
  },
  selectedItemLabelStyle: {
    fontWeight: 'bold',
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryCount: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#777',
  },
  logItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  logIconContainer: {
    marginRight: 12,
    padding: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logIcon: {
    width: 24,
    height: 24,
    tintColor: '#fff',
  },
  logContent: {
    flex: 1,
    flexShrink: 1,
    width: '100%',
  },
  logStatus: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  logMessage: {
    fontSize: 14,
    color: '#555',
    marginBottom: 4,
    flexWrap: 'wrap',
    width: '100%',
  },
  logDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  logDetailTag: {
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 4,
    fontSize: 14,
  },
  logTimestamp: {
    fontSize: 14,
    color: '#777',
  },
  loadMoreButton: {
    backgroundColor: '#007bff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  loadMoreButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  clearButton: {
    backgroundColor: '#dc3545',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: 'center',
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bottomNavBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  navBarItem: {
    alignItems: 'center',
  },
  navBarIcon: {
    width: 24,
    height: 24,
  },
  navBarIconActive: {},
  navBarText: {
    fontSize: 12,
    color: '#777',
    marginTop: 4,
  },
  navBarTextActive: {
    color: '#007bff',
    fontWeight: 'bold',
  },
  summaryCard: {
    paddingVertical: 10,
    marginBottom: 10,
  },
  logLevelCard: {
    paddingVertical: 10,
    marginBottom: 10,
  },
});

export default LogScreen;
