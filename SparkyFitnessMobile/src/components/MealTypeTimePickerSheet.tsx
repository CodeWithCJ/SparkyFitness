import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import { sheetContainer, useSheetBackdrop } from './ui/sheetChrome';
import MealTypeTimeWheel from './MealTypeTimeWheel';
import Icon from './Icon';
import Button from './ui/Button';

export interface MealTypeTimePickerSheetRef {
  present: (initialTime: string | null, onSelect: (time: string | null) => void) => void;
  dismiss: () => void;
}

/**
 * Dedicated large 24-hour wheel time picker (maintainer mockup: hours | minutes,
 * several rows above/below a rounded selected row). The wheel is the dominant
 * element — the shared MealTypeTimeWheel (own full-width layout, 24-hour) renders
 * directly in this sheet and in the inline Create flow, so both surfaces show
 * ONE implementation of the SAME visible wheel.
 *
 * Behavior:
 * - opening with "08:30" selects 08:30;
 * - opening with NO existing time seeds the pending value with the exact
 *   HH:MM the wheel displays (current time), so Save without scrolling commits
 *   what the user SEES — visible wheel and saved payload never disagree;
 * - Save commits the canonical "HH:MM";
 * - Clear commits null;
 * - swiping/backdrop dismiss WITHOUT Save/Clear makes NO change (pending state
 *   is cleared on dismiss and the callback is never invoked);
 * - scrolling the wheel alone never mutates anything.
 */
const MealTypeTimePickerSheet = forwardRef<MealTypeTimePickerSheetRef>((_props, ref) => {
  const { t } = useTranslation();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const [surfaceBg, textMuted, textPrimary] = useCSSVariable([
    '--color-surface',
    '--color-text-muted',
    '--color-text-primary',
  ]) as [string, string, string];

  const [pendingValue, setPendingValue] = useState<string | null>(null);
  const onSelectRef = useRef<((time: string | null) => void) | null>(null);

  useImperativeHandle(ref, () => ({
    present: (initialTime, onSelect) => {
      // When no time is set, the wheel shows the current time; seed the
      // pending value with EXACTLY what the wheel displays so Save commits
      // the visible value (never a misleading null while showing a time).
      if (initialTime) {
        setPendingValue(initialTime);
      } else {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        setPendingValue(`${hh}:${mm}`);
      }
      onSelectRef.current = onSelect;
      bottomSheetRef.current?.present();
    },
    dismiss: () => bottomSheetRef.current?.dismiss(),
  }));

  const renderBackdrop = useSheetBackdrop();

  const handleWheelChange = useCallback((hhmm: string) => {
    setPendingValue(hhmm);
  }, []);

  const commit = useCallback((time: string | null) => {
    const cb = onSelectRef.current;
    onSelectRef.current = null;
    bottomSheetRef.current?.dismiss();
    cb?.(time);
  }, []);

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      enableDynamicSizing
      enableContentPanningGesture={Platform.OS !== 'android'}
      backdropComponent={renderBackdrop}
      containerComponent={sheetContainer}
      backgroundStyle={{ backgroundColor: surfaceBg }}
      handleIndicatorStyle={{ backgroundColor: textMuted }}
      onDismiss={() => {
        // Dismiss without Save/Clear: never invoke the callback, never keep
        // stale pending state for the next open.
        onSelectRef.current = null;
        setPendingValue(null);
      }}
    >
      <BottomSheetView className="px-5 pb-safe-or-8">
        <Text className="text-text-primary text-lg font-semibold text-center mb-3">
          {t('mealTypeTime.defaultTitle', { defaultValue: 'Default Time' })}
        </Text>

        {/* Dominant wheel area (shared component, own full-width layout). The
            sheet renders the shared wheel DIRECTLY under BottomSheetView — no
            extra fixed-height wrapper here; MealTypeTimeWheel is the single
            owner of its own dimensioning. */}
        <MealTypeTimeWheel
          value={pendingValue}
          onChange={handleWheelChange}
          testID="large-time-wheel"
        />

        <View className="flex-row gap-3 mb-4">
          <TouchableOpacity
            onPress={() => commit(null)}
            className="flex-1 items-center justify-center py-3 rounded-lg border border-border-subtle"
            accessibilityRole="button"
            accessibilityLabel={t('mealTypeTime.clearHint', { defaultValue: 'Clear default time' })}
          >
            <View className="flex-row items-center gap-1.5">
              <Icon name="close" size={16} color={textPrimary} />
              <Text className="text-sm font-medium text-text-primary">{t('common.clear', { defaultValue: 'Clear' })}</Text>
            </View>
          </TouchableOpacity>
          <Button
            variant="primary"
            className="flex-1"
            onPress={() => commit(pendingValue)}
            accessibilityLabel={t('mealTypeTime.saveHint', { defaultValue: 'Save default time' })}
          >
            {t('common.save', { defaultValue: 'Save' })}
          </Button>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

MealTypeTimePickerSheet.displayName = 'MealTypeTimePickerSheet';

export default MealTypeTimePickerSheet;
