import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { FullWindowOverlay } from 'react-native-screens';
import { useCSSVariable, useUniwind } from 'uniwind';
import Toast from 'react-native-toast-message';

import Icon from './Icon';
import FastingEditSheet, { type FastingEditSheetRef } from './FastingEditSheet';
import { FastingProtocolBadge } from './FastingSharedComponents';
import { useFastingHistory, useDeleteFast } from '../hooks/useFasting';
import { getAppLocale } from '../localization';
import {
  formatLocalizedFastingDuration,
  formatLocalizedFastingTime,
  getLocalizedFastingHistoryDayLabel,
} from '../utils/fastingLocalization';
import { addLog } from '../services/LogService';
import type { FastingLog } from '../types/fasting';

// Render the sheet inside an iOS UIWindow so it sits above any native modal
// presentation. No-op on Android.
const sheetContainer =
  Platform.OS === 'ios'
    ? ({ children }: React.PropsWithChildren) => (
        <FullWindowOverlay>{children}</FullWindowOverlay>
      )
    : undefined;

const PAGE_SIZE = 25;
const DELETE_ACTION_WIDTH = 80;

interface FastingHistoryRowProps {
  fast: FastingLog;
  isLast: boolean;
  onEdit: (fast: FastingLog) => void;
  onDelete: (fast: FastingLog) => void;
  textMuted: string;
}

const FastingHistoryRow: React.FC<FastingHistoryRowProps> = ({
  fast,
  isLast,
  onEdit,
  onDelete,
  textMuted,
}) => {
  const { t } = useTranslation();
  const appLocale = getAppLocale();
  const dayLabel = getLocalizedFastingHistoryDayLabel(
    t,
    fast.end_time ?? fast.start_time,
  );
  const durationLabel =
    fast.duration_minutes != null
      ? formatLocalizedFastingDuration(t, fast.duration_minutes * 60000)
      : '—';
  const timeRangeLabel = fast.end_time
    ? `${formatLocalizedFastingTime(
        fast.start_time,
        appLocale,
      )} → ${formatLocalizedFastingTime(fast.end_time, appLocale)}`
    : formatLocalizedFastingTime(fast.start_time, appLocale);

  const renderRightActions = () => (
    <TouchableOpacity
      className="bg-bg-danger justify-center items-center ml-4"
      style={{ width: DELETE_ACTION_WIDTH }}
      onPress={() => onDelete(fast)}
      activeOpacity={0.7}
    >
      <Text className="text-text-danger font-semibold text-sm">
        {t('fasting.history.delete')}
      </Text>
    </TouchableOpacity>
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
            <FastingProtocolBadge
              protocol={fast.fasting_type ?? ''}
              variant="subtle"
              className="ml-2"
            />
          </View>
          <Text className="text-sm text-text-secondary mt-0.5">
            {timeRangeLabel}
          </Text>
        </View>
        <View className="flex-row items-center">
          <Text className="text-base font-semibold text-text-primary mr-2">
            {durationLabel}
          </Text>
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

const FastingHistorySheet = forwardRef<FastingHistorySheetRef>(
  (_props, ref) => {
    const { t } = useTranslation();
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const editSheetRef = useRef<FastingEditSheetRef>(null);
    const { theme } = useUniwind();
    const isDarkMode = theme === 'dark' || theme === 'amoled';

    const [limit, setLimit] = useState(PAGE_SIZE);

    const [surfaceBg, textMuted, accentPrimary] = useCSSVariable([
      '--color-surface',
      '--color-text-muted',
      '--color-accent-primary',
    ]) as [string, string, string];

    const { data: history, isLoading } = useFastingHistory(limit, 0);
    const { mutate: deleteFast } = useDeleteFast();
    // The active fast is managed by the card and completion flow, not this list.
    const pastFasts = (history ?? []).filter(fast => fast.status !== 'ACTIVE');
    const canLoadMore = (history?.length ?? 0) >= limit;

    useImperativeHandle(ref, () => ({
      present: () => bottomSheetRef.current?.present(),
      dismiss: () => bottomSheetRef.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          opacity={isDarkMode ? 0.7 : 0.5}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      ),
      [isDarkMode],
    );

    const openEdit = (fast: FastingLog) => editSheetRef.current?.present(fast);

    const confirmDelete = (fast: FastingLog) => {
      Alert.alert(
        t('fasting.management.deleteTitle'),
        t('fasting.management.deleteMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => {
              deleteFast(fast.id, {
                onSuccess: () =>
                  Toast.show({
                    type: 'success',
                    text1: t('fasting.edit.deleted'),
                  }),
                onError: error => {
                  addLog(
                    `${t('fasting.edit.deleteFailed')}: ${error}`,
                    'ERROR',
                  );
                  Toast.show({
                    type: 'error',
                    text1: t('fasting.edit.deleteFailed'),
                    text2: t('fasting.toast.retry'),
                  });
                },
              });
            },
          },
        ],
      );
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
              {t('fasting.history.title')}
            </Text>
            <Text className="text-center text-text-muted text-xs mb-4">
              {t('fasting.history.hint')}
            </Text>

            {isLoading && pastFasts.length === 0 ? (
              <View className="items-center py-8">
                <ActivityIndicator size="small" color={accentPrimary} />
              </View>
            ) : pastFasts.length === 0 ? (
              <View className="items-center py-8">
                <Icon name="history" size={28} color={textMuted} />
                <Text className="text-sm text-text-muted mt-2">
                  {t('fasting.history.empty')}
                </Text>
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
                  />
                ))}
              </View>
            )}

            {canLoadMore && (
              <Pressable
                onPress={() => setLimit(n => n + PAGE_SIZE)}
                className="items-center py-3 mt-1"
              >
                <Text
                  className="text-sm font-medium"
                  style={{ color: accentPrimary }}
                >
                  {t('fasting.history.loadMore')}
                </Text>
              </Pressable>
            )}
          </BottomSheetScrollView>
        </BottomSheetModal>

        <FastingEditSheet ref={editSheetRef} />
      </>
    );
  },
);

FastingHistorySheet.displayName = 'FastingHistorySheet';

export default FastingHistorySheet;
