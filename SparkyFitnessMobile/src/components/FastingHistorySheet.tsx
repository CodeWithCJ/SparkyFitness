import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';

import Icon from './Icon';
import { DeleteRowAction } from './SwipeableDeleteRow';
import { sheetContainer, useSheetBackdrop } from './ui/sheetChrome';
import FastingEditSheet, { type FastingEditSheetRef } from './FastingEditSheet';
import { FastingProtocolBadge } from './FastingSharedComponents';
import { useFastingHistory, useDeleteFast } from '../hooks/useFasting';
import { formatHoursMinutes, relativeDayLabel, formatTime } from '../utils/fasting';
import { toLocalDateString } from '../utils/dateUtils';
import { addLog } from '../services/LogService';
import type { FastingLog } from '../types/fasting';

const PAGE_SIZE = 25;

interface FastingHistoryRowProps {
  fast: FastingLog;
  isLast: boolean;
  onEdit: (fast: FastingLog) => void;
  onDelete: (fast: FastingLog) => void;
  textMuted: string;
  t: ReturnType<typeof useTranslation>['t'];
}

const FastingHistoryRow: React.FC<FastingHistoryRowProps> = ({
  fast,
  isLast,
  onEdit,
  onDelete,
  textMuted,
  t,
}) => {
  const dayLabel = relativeDayLabel(toLocalDateString(fast.end_time ?? fast.start_time), t);
  const durationLabel =
    fast.duration_minutes != null ? formatHoursMinutes(fast.duration_minutes * 60000, t) : '—';
  const timeRangeLabel = fast.end_time
    ? `${formatTime(fast.start_time)} → ${formatTime(fast.end_time)}`
    : formatTime(fast.start_time);

  const renderRightActions = () => (
    <DeleteRowAction onPress={() => onDelete(fast)} className="ml-4" />
  );

  return (
    <ReanimatedSwipeable
      renderRightActions={renderRightActions}
      overshootRight={false}
      rightThreshold={40}
    >
      <TouchableOpacity
        onPress={() => onEdit(fast)}
        activeOpacity={0.7}
        className={`flex-row items-center justify-between py-3 bg-surface ${
          isLast ? '' : 'border-b border-border-subtle'
        }`}
      >
        <View className="flex-1 pr-3">
          <View className="flex-row items-center">
            <Text className="text-base font-semibold text-text-primary capitalize">
              {dayLabel}
            </Text>
            <FastingProtocolBadge protocol={fast.fasting_type ?? ''} variant="subtle" className="ml-2" />
          </View>
          <Text className="text-sm text-text-secondary mt-0.5">{timeRangeLabel}</Text>
        </View>
        <View className="flex-row items-center">
          <Text className="text-base font-semibold text-text-primary mr-2">{durationLabel}</Text>
          <Icon name="chevron-forward" size={14} color={textMuted} />
        </View>
      </TouchableOpacity>
    </ReanimatedSwipeable>
  );
};

export interface FastingHistorySheetRef {
  present: () => void;
  dismiss: () => void;
}

const FastingHistorySheet = forwardRef<FastingHistorySheetRef>((_props, ref) => {
  const { t } = useTranslation();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const editSheetRef = useRef<FastingEditSheetRef>(null);

  const [limit, setLimit] = useState(PAGE_SIZE);

  const [surfaceBg, textMuted, accentPrimary] = useCSSVariable([
    '--color-surface',
    '--color-text-muted',
    '--color-accent-primary',
  ]) as [string, string, string];

  const { data: history, isLoading } = useFastingHistory(limit, 0);
  const { mutate: deleteFast } = useDeleteFast();
  // The active fast is managed from the card / End Fast flow, not this list.
  const pastFasts = (history ?? []).filter((fast) => fast.status !== 'ACTIVE');
  const canLoadMore = (history?.length ?? 0) >= limit;

  useImperativeHandle(ref, () => ({
    present: () => bottomSheetRef.current?.present(),
    dismiss: () => bottomSheetRef.current?.dismiss(),
  }));

  const renderBackdrop = useSheetBackdrop();

  const openEdit = (fast: FastingLog) => editSheetRef.current?.present(fast);

  const confirmDelete = (fast: FastingLog) => {
    Alert.alert(t('fastingHistory.deleteTitle', { defaultValue: 'Delete fast?' }), t('fastingHistory.deleteMessage', { defaultValue: 'This cannot be undone.' }), [
      { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
      {
        text: t('common.delete', { defaultValue: 'Delete' }),
        style: 'destructive',
        onPress: () => {
          deleteFast(fast.id, {
            onSuccess: () => Toast.show({ type: 'success', text1: t('fastingHistory.deleted', { defaultValue: 'Fast deleted' }) }),
            onError: (error) => {
              addLog(`Failed to delete fast: ${error}`, 'ERROR');
              Toast.show({
                type: 'error',
                text1: t('fastingHistory.failedDelete', { defaultValue: 'Failed to delete fast' }),
                text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
              });
            },
          });
        },
      },
    ]);
  };

  return (
    <>
      <BottomSheetModal
        ref={bottomSheetRef}
        enableDynamicSizing
        backdropComponent={renderBackdrop}
        containerComponent={sheetContainer}
        backgroundStyle={{ backgroundColor: surfaceBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
      >
        <BottomSheetScrollView contentContainerClassName="bg-surface px-5 pb-safe-or-8">
          <Text className="text-lg font-semibold text-text-primary text-center mb-1">
            {t('fastingHistory.title', { defaultValue: 'Fasting history' })}
          </Text>
          <Text className="text-center text-text-muted text-xs mb-4">
            {t('fastingHistory.hint', { defaultValue: 'Tap to edit · swipe left to delete' })}
          </Text>

          {isLoading && pastFasts.length === 0 ? (
            <View className="items-center py-8">
              <ActivityIndicator size="small" color={accentPrimary} />
            </View>
          ) : pastFasts.length === 0 ? (
            <View className="items-center py-8">
              <Icon name="history" size={28} color={textMuted} />
              <Text className="text-sm text-text-muted mt-2">{t('fastingHistory.empty', { defaultValue: 'No past fasts yet.' })}</Text>
            </View>
          ) : (
            <View>
              {pastFasts.map((fast, index) => (
                <FastingHistoryRow
                  key={fast.id}
                  fast={fast}
                  isLast={index === pastFasts.length - 1}
                  onEdit={openEdit}
                  onDelete={confirmDelete}
                  textMuted={textMuted}
                  t={t}
                />
              ))}
            </View>
          )}

          {canLoadMore && (
            <Pressable
              onPress={() => setLimit((n) => n + PAGE_SIZE)}
              className="items-center py-3 mt-1"
            >
              <Text className="text-sm font-medium" style={{ color: accentPrimary }}>
                {t('common.loadMore', { defaultValue: 'Load more' })}
              </Text>
            </Pressable>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>

      <FastingEditSheet ref={editSheetRef} />
    </>
  );
});

FastingHistorySheet.displayName = 'FastingHistorySheet';

export default FastingHistorySheet;
