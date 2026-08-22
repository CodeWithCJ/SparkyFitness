import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import DateTimePicker, { type DateType } from 'react-native-ui-datepicker';
import Toast from 'react-native-toast-message';

import Icon from './Icon';
import { sheetContainer, useSheetBackdrop } from './ui/sheetChrome';
import { useEndFast } from '../hooks/useFasting';
import { formatHoursMinutes, formatDateTime } from '../utils/fasting';
import { dateTypeToDate } from './TimeSheet';
import { addLog } from '../services/LogService';
import type { FastingLog } from '../types/fasting';

/** Normalizes the picker's 6-way `DateType` into a JS `Date`, preserving time. */
export interface EndFastSheetRef {
  present: (fast: FastingLog) => void;
  dismiss: () => void;
}

interface EndFastSheetProps {
  onEnded?: () => void;
}

const EndFastSheet = forwardRef<EndFastSheetRef, EndFastSheetProps>(({ onEnded }, ref) => {
  const { t } = useTranslation();
  const bottomSheetRef = useRef<BottomSheetModal>(null);

  const [surfaceBg, textMuted, accentPrimary, textPrimary, textSecondary] = useCSSVariable([
    '--color-surface',
    '--color-text-muted',
    '--color-accent-primary',
    '--color-text-primary',
    '--color-text-secondary',
  ]) as [string, string, string, string, string];

  const [fastId, setFastId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date>(() => new Date());
  const [endDate, setEndDate] = useState<Date>(() => new Date());
  const [openPicker, setOpenPicker] = useState<'start' | 'end' | null>(null);

  const { mutate: endFast, isPending } = useEndFast();

  useImperativeHandle(ref, () => ({
    present: (fast) => {
      setFastId(fast.id);
      const start = new Date(fast.start_time);
      setStartDate(Number.isNaN(start.getTime()) ? new Date() : start);
      setEndDate(new Date());
      setOpenPicker(null);
      bottomSheetRef.current?.present();
    },
    dismiss: () => bottomSheetRef.current?.dismiss(),
  }));

  const renderBackdrop = useSheetBackdrop();

  const handleStartChange = useCallback(({ date }: { date: DateType }) => {
    const js = dateTypeToDate(date);
    if (js && !Number.isNaN(js.getTime())) setStartDate(js);
  }, []);

  const handleEndChange = useCallback(({ date }: { date: DateType }) => {
    const js = dateTypeToDate(date);
    if (js && !Number.isNaN(js.getTime())) setEndDate(js);
  }, []);

  const isValid = startDate.getTime() < endDate.getTime();
  const durationLabel = useMemo(
    () =>
      formatHoursMinutes(Math.max(0, endDate.getTime() - startDate.getTime()), t),
    [startDate, endDate, t],
  );

  const pickerStyles = useMemo(
    () => ({
      selected: { backgroundColor: accentPrimary },
      selected_label: { color: '#FFFFFF' },
      today: { borderColor: accentPrimary, borderWidth: 1 },
      day_label: { color: textPrimary },
      weekday_label: { color: textSecondary },
      month_selector_label: { color: textPrimary, fontWeight: '600' as const },
      year_selector_label: { color: textPrimary, fontWeight: '600' as const },
      time_selector_label: { color: textPrimary, fontWeight: '600' as const },
      // Hide the calendar header's time button — we render a dedicated time
      // wheel below the calendar instead.
      time_selector: { display: 'none' as const },
      disabled_label: { color: textMuted },
      month_label: { color: textPrimary },
      year_label: { color: textPrimary },
      time_label: { color: textPrimary },
      selected_month: { backgroundColor: accentPrimary },
      selected_month_label: { color: '#FFFFFF' },
      selected_year: { backgroundColor: accentPrimary },
      selected_year_label: { color: '#FFFFFF' },
    }),
    [accentPrimary, textPrimary, textSecondary, textMuted],
  );

  const pickerComponents = useMemo(
    () => ({
      IconPrev: <Icon name="chevron-back" size={18} color={textPrimary} />,
      IconNext: <Icon name="chevron-forward" size={18} color={textPrimary} />,
    }),
    [textPrimary],
  );

  const handleEnd = () => {
    if (!fastId || !isValid) return;
    endFast(
      {
        id: fastId,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
      },
      {
        onSuccess: () => {
          bottomSheetRef.current?.dismiss();
          Toast.show({ type: 'success', text1: t('fastingEdit.fastEnded', { defaultValue: 'Fast ended' }) });
          onEnded?.();
        },
        onError: (error) => {
          addLog(`Failed to end fast: ${error}`, 'ERROR');
          Toast.show({
            type: 'error',
            text1: t('fastingEdit.failedEnd', { defaultValue: 'Failed to end fast' }),
            text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
          });
        },
      },
    );
  };

  const togglePicker = (picker: 'start' | 'end') => {
    setOpenPicker((p) => (p === picker ? null : picker));
  };

  const renderRow = (
    label: string,
    value: string,
    picker: 'start' | 'end',
  ) => (
    <TouchableOpacity
      onPress={() => togglePicker(picker)}
      activeOpacity={0.7}
      className="flex-row items-center justify-between py-3 border-b border-border-subtle"
    >
      <Text className="text-base text-text-primary">{label}</Text>
      <View className="flex-row items-center">
        <Text className="text-sm" style={{ color: accentPrimary }}>
          {value}
        </Text>
        <Icon
          name={openPicker === picker ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={accentPrimary}
          style={{ marginLeft: 4 }}
        />
      </View>
    </TouchableOpacity>
  );

  const renderInlinePicker = (
    value: Date,
    onChange: (payload: { date: DateType }) => void,
  ) => (
    <View className="mt-2">
      {/* Calendar for the date. `timePicker` keeps the time-of-day when a day
          is tapped (otherwise the library zeroes it). */}
      <DateTimePicker
        mode="single"
        date={value}
        timePicker
        onChange={onChange}
        components={pickerComponents}
        styles={pickerStyles}
      />
      {/* Dedicated time wheel below the calendar, sharing the same value. */}
      <View className="border-t border-border-subtle mt-1 pt-2">
        <Text className="text-xs font-semibold uppercase text-text-muted tracking-wide mb-1 px-1">
          {t('fastingEdit.time', { defaultValue: 'Time' })}
        </Text>
        <DateTimePicker
          mode="single"
          date={value}
          timePicker
          initialView="time"
          hideHeader
          onChange={onChange}
          styles={pickerStyles}
        />
      </View>
    </View>
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      enableDynamicSizing
      // On Android the sheet's content pan gesture steals vertical drags from
      // the time picker's wheels (plain FlatLists), so content panning stays
      // off there. Must be static: toggling this prop swaps the sheet's
      // content wrapper component, remounting the content and dismissing the
      // modal.
      enableContentPanningGesture={Platform.OS !== 'android'}
      backdropComponent={renderBackdrop}
      containerComponent={sheetContainer}
      backgroundStyle={{ backgroundColor: surfaceBg }}
      handleIndicatorStyle={{ backgroundColor: textMuted }}
    >
      {/* bg-surface is a touch shield, not decoration: with content panning off
          on Android, gesture-handler lets taps on background-less views fall
          through to the backdrop's tap-to-close. A background makes this
          container absorb them. */}
      <BottomSheetScrollView contentContainerClassName="bg-surface px-5 pb-safe-or-8">
        <Text className="text-lg font-semibold text-text-primary text-center mb-1">
          {t('fastingEdit.endTitle', { defaultValue: 'End fast' })}
        </Text>
        <Text className="text-center text-text-secondary mb-4">{t('fastingEdit.fasted', { defaultValue: '{{duration}} fasted', duration: durationLabel })}</Text>

        {renderRow(t('fastingEdit.started', { defaultValue: 'Started' }), formatDateTime(startDate), 'start')}
        {openPicker === 'start' && renderInlinePicker(startDate, handleStartChange)}

        {renderRow(t('fastingEdit.ended', { defaultValue: 'Ended' }), formatDateTime(endDate), 'end')}
        {openPicker === 'end' && renderInlinePicker(endDate, handleEndChange)}

        {!isValid && (
          <Text className="text-text-danger-subtle text-sm mt-3 text-center">
            {t('fastingEdit.beforeEnd', { defaultValue: 'Start time must be before the end time.' })}
          </Text>
        )}

        <Pressable
          onPress={handleEnd}
          disabled={isPending || !isValid}
          className={`flex-row items-center justify-center rounded-xl py-3.5 mt-4 bg-bg-danger ${
            isPending || !isValid ? 'opacity-50' : ''
          }`}
        >
          <Icon name="stop" size={15} color="#FFFFFF" />
          <Text className="text-white text-base font-semibold ml-2">
            {isPending ? t('fastingEdit.ending', { defaultValue: 'Ending...' }) : t('fastingEdit.endAction', { defaultValue: 'End Fast' })}
          </Text>
        </Pressable>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

EndFastSheet.displayName = 'EndFastSheet';

export default EndFastSheet;
