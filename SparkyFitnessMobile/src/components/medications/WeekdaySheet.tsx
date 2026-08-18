import { forwardRef, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import { localizedWeekdayLabels } from '../../utils/medicationScheduleLocalization';
import Icon from '../Icon';
import { sheetContainer, useSheetBackdrop } from '../ui/sheetChrome';

export interface WeekdaySheetRef {
  present: () => void;
  dismiss: () => void;
}

interface WeekdaySheetProps {
  /** Selected days as day-of-week indices (0 = Sunday … 6 = Saturday). */
  value: number[];
  onChange: (days: number[]) => void;
}

/** Multi-select bottom sheet for a schedule's days_of_week. Selecting a day
 * toggles it without dismissing, so several days can be picked in one visit. */
const WeekdaySheet = forwardRef<WeekdaySheetRef, WeekdaySheetProps>(({ value, onChange }, ref) => {
  const { t } = useTranslation();
  const bottomSheetRef = useRef<BottomSheetModal>(null);

  const [surfaceBg, textMuted, accentPrimary] = useCSSVariable([
    '--color-surface',
    '--color-text-muted',
    '--color-accent-primary',
  ]) as [string, string, string];

  useImperativeHandle(ref, () => ({
    present: () => bottomSheetRef.current?.present(),
    dismiss: () => bottomSheetRef.current?.dismiss(),
  }));

  const renderBackdrop = useSheetBackdrop();

  const toggle = (day: number) => {
    const next = value.includes(day) ? value.filter((d) => d !== day) : [...value, day];
    onChange(next.sort((a, b) => a - b));
  };

  const weekdayLabels = localizedWeekdayLabels(t);

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      enableDynamicSizing
      enableContentPanningGesture={Platform.OS !== 'android'}
      backdropComponent={renderBackdrop}
      containerComponent={sheetContainer}
      backgroundStyle={{ backgroundColor: surfaceBg }}
      handleIndicatorStyle={{ backgroundColor: textMuted }}
    >
      <BottomSheetView className="pb-safe-or-5">
        <View className="px-4 py-4 border-b border-border-subtle">
          <Text className="text-lg font-semibold text-center text-text-primary">{t('medications.weekdays.title', { defaultValue: 'Days of Week' })}</Text>
        </View>
        {weekdayLabels.map((label, day) => {
          const selected = value.includes(day);
          return (
            <TouchableOpacity
              key={label}
              className="flex-row items-center justify-between px-4 py-3.5 border-b border-border-subtle"
              style={{ borderBottomWidth: StyleSheet.hairlineWidth }}
              onPress={() => toggle(day)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('medications.weekdays.itemA11y', {
                defaultValue: '{{day}}, {{state}}',
                day: label,
                state: selected
                  ? t('medications.weekdays.selected', { defaultValue: 'selected' })
                  : t('medications.weekdays.notSelected', { defaultValue: 'not selected' }),
              })}
              accessibilityState={{ selected }}
            >
              <Text className={`text-base text-text-primary ${selected ? 'font-semibold' : ''}`}>
                {label}
              </Text>
              {selected && <Icon name="checkmark" size={20} color={accentPrimary} />}
            </TouchableOpacity>
          );
        })}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

WeekdaySheet.displayName = 'WeekdaySheet';

export default WeekdaySheet;
