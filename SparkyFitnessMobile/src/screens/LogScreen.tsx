import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import Toast from 'react-native-toast-message';
import Icon, { IconName } from '../components/Icon';
import Clipboard from '@react-native-clipboard/clipboard';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import {
  getLogs,
  clearLogs,
  getViewSelectedStatuses,
  setViewSelectedStatuses,
} from '../services/LogService';
import type { LogEntry, LogStatus } from '../services/LogService';
import type { RootStackScreenProps } from '../types/navigation';
import {
  formatMobileLogCount,
  formatMobileNumber,
  mobileT,
} from '../localization';
import { formatDateTime } from '../utils/dateUtils';

type LogScreenProps = RootStackScreenProps<'Logs'>;

const MAX_LOGS_TO_LOAD = 1000;
const LEVEL_CHIPS: { status: LogStatus; label: string; color: string; activeColor?: string }[] = [
  { status: 'ERROR', label: mobileT('logs.level.error'), color: '#dc3545' },
  { status: 'WARNING', label: mobileT('logs.level.warning'), color: '#ffc107' },
  { status: 'INFO', label: mobileT('logs.level.info'), color: '#007bff', activeColor: '#ffffff' },
  { status: 'DEBUG', label: mobileT('logs.level.debug'), color: '#6c757d', activeColor: '#d1d5db' },
];

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'WARNING': return '#ffc107';
    case 'INFO': return '#007bff';
    case 'DEBUG': return '#6c757d';
    default: return '#dc3545';
  }
};

const getStatusIcon = (status: string): IconName => {
  switch (status) {
    case 'WARNING': return 'warning';
    case 'INFO': return 'info-circle';
    case 'DEBUG': return 'wrench';
    default: return 'alert-circle';
  }
};

interface FilterChipProps {
  label: string;
  count: number;
  active: boolean;
  color?: string;
  activeColor?: string;
  onPress: () => void;
}

const TRANSPARENT = 'rgba(0,0,0,0)';
const CHIP_ANIMATION_DURATION = 250;

const FilterChip: React.FC<FilterChipProps> = ({ label, count, active, color, activeColor, onPress }) => {
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;
  const accentText = useCSSVariable('--color-accent-text') as string;
  const borderSubtle = useCSSVariable('--color-border-subtle') as string;
  const textSecondary = useCSSVariable('--color-text-secondary') as string;

  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, { duration: CHIP_ANIMATION_DURATION });
  }, [active, progress]);

  const chipStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [TRANSPARENT, accentPrimary]),
    borderColor: interpolateColor(progress.value, [0, 1], [borderSubtle, accentPrimary]),
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [textSecondary, accentText]),
  }));

  const dotStyle = useAnimatedStyle(() => {
    if (!color) return {};
    return {
      backgroundColor: interpolateColor(
        progress.value,
        [0, 1],
        [color, activeColor ?? color],
      ),
    };
  });

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Animated.View
        className="flex-row items-center rounded-full px-3 py-1.5 me-2 mb-2 border"
        style={chipStyle}
      >
        {color && (
          <Animated.View className="w-2 h-2 rounded-full me-2" style={dotStyle} />
        )}
        <Animated.Text className="text-sm font-medium" style={labelStyle}>
          {label} {formatMobileNumber(count)}
        </Animated.Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

const LogScreen: React.FC<LogScreenProps> = () => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
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
      Toast.show({
        type: 'error',
        text1: mobileT('common.error'),
        text2: mobileT('logs.filterSaveFailed'),
      });
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
      mobileT('logs.clearTitle'),
      mobileT('logs.clearDescription'),
      [
        { text: mobileT('common.cancel'), style: 'cancel' },
        {
          text: mobileT('logs.clearAction'),
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

  // Clear is destructive-ish but not a save, so it stays a neutral text action.
  const header = useScreenHeader({
    title: mobileT('screens.logs'),
    left: { kind: 'back' },
    right: {
      kind: 'text',
      label: mobileT('logs.clearAction'),
      role: 'secondary',
      disabled: !hasLogs,
      onPress: handleClearLogs,
      accessibilityLabel: mobileT('logs.clearAccessibility'),
      identifier: 'logs-clear',
    },
  });

  const handleCopyLogToClipboard = (item: LogEntry): void => {
    const lines = [
      mobileT('logs.copyStatus', { status: item.status }),
      mobileT('logs.copyMessage', { message: item.message }),
    ];

    if (item.details && item.details.length > 0) {
      lines.push(
        mobileT('logs.copyDetails', { details: item.details.join('، ') }),
      );
    }

    lines.push(
      mobileT('logs.copyTimestamp', {
        timestamp: formatDateTime(new Date(item.timestamp)),
      }),
    );

    Clipboard.setString(lines.join('\n'));

    Toast.show({
      type: 'success',
      text1: mobileT('logs.copied'),
      text2: mobileT('logs.copiedDescription'),
    });
  };

  const filteredLogs = useMemo(() => {
    if (selectedStatuses.length === 0) return logs;
    return logs.filter(log => selectedStatuses.includes(log.status));
  }, [logs, selectedStatuses]);

  const allActive = selectedStatuses.length === 0;

  const statusCounts = useMemo(() => {
    const counts: Record<LogStatus, number> = { ERROR: 0, WARNING: 0, INFO: 0, DEBUG: 0 };
    for (const log of logs) {
      counts[log.status] = (counts[log.status] ?? 0) + 1;
    }
    return counts;
  }, [logs]);

  const showSummary = allActive || selectedStatuses.length > 1;

  const summaryLabel = formatMobileLogCount(filteredLogs.length);

  const ListHeader = (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-4"
        contentContainerStyle={{ paddingHorizontal: 16 }}
      >
        <FilterChip
          label={mobileT('logs.all')}
          count={logs.length}
          active={allActive}
          onPress={handleSelectAll}
        />
        {LEVEL_CHIPS.map(chip => (
          <FilterChip
            key={chip.status}
            label={chip.label}
            count={statusCounts[chip.status]}
            active={selectedStatuses.includes(chip.status)}
            color={chip.color}
            activeColor={chip.activeColor}
            onPress={() => handleToggleStatus(chip.status)}
          />
        ))}
      </ScrollView>
      {showSummary && (
        <Text className="text-sm text-text-muted mb-3">{summaryLabel}</Text>
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      <FlatList
        data={filteredLogs}
        ListHeaderComponent={ListHeader}
        renderItem={({ item }: { item: LogEntry }) => (
          <TouchableOpacity
            className="bg-surface rounded-xl p-4 mb-3 flex-row items-center w-full shadow-sm"
            onPress={() => handleCopyLogToClipboard(item)}
            activeOpacity={0.7}
          >
            <View className="me-3 items-center justify-center">
              <Icon
                name={getStatusIcon(item.status)}
                size={28}
                color={getStatusColor(item.status)}
              />
            </View>
            <View className="flex-1 shrink w-full">
              <Text
                className="text-sm mb-1 flex-wrap w-full text-text-primary"
                numberOfLines={4}
                ellipsizeMode="tail"
              >
                {item.message}
              </Text>
              <View className="flex-row flex-wrap mb-1">
                {item.details &&
                  item.details.map((detail, index) => (
                    <Text
                      key={index}
                      className="bg-raised rounded px-2 py-1 me-2 mb-1 text-sm text-text-primary"
                      numberOfLines={3}
                      ellipsizeMode="tail"
                    >
                      {detail}
                    </Text>
                  ))}
              </View>
              <Text className="text-sm text-text-muted">
                {formatDateTime(new Date(item.timestamp))}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        keyExtractor={(item, index) => `${item.timestamp}-${index}`}
        ListEmptyComponent={() => (
          <View className="items-center py-8">
            <Text className="text-text-muted text-base">
              {logs.length === 0
                ? mobileT('logs.empty')
                : mobileT('logs.noMatches')}
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
