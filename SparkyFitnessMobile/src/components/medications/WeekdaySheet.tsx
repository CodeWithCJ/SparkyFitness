import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { FullWindowOverlay } from 'react-native-screens';
import { useCSSVariable, useUniwind } from 'uniwind';
import { DAY_LABELS } from '@workspace/shared';
import Icon from '../Icon';

// Render the sheet inside an iOS UIWindow so it sits above any native modal
// presentation. No-op on Android.
const sheetContainer =
  Platform.OS === 'ios'
    ? ({ children }: React.PropsWithChildren) => <FullWindowOverlay>{children}</FullWindowOverlay>
    : undefined;

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
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const { theme } = useUniwind();
  const isDarkMode = theme === 'dark' || theme === 'amoled';

  const [surfaceBg, textMuted, accentPrimary] = useCSSVariable([
    '--color-surface',
    '--color-text-muted',
    '--color-accent-primary',
  ]) as [string, string, string];

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

  const toggle = (day: number) => {
    const next = value.includes(day) ? value.filter((d) => d !== day) : [...value, day];
    onChange(next.sort((a, b) => a - b));
  };

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
          <Text className="text-lg font-semibold text-center text-text-primary">Days of Week</Text>
        </View>
        {DAY_LABELS.map((label, day) => {
          const selected = value.includes(day);
          return (
            <TouchableOpacity
              key={label}
              className="flex-row items-center justify-between px-4 py-3.5 border-b border-border-subtle"
              style={{ borderBottomWidth: StyleSheet.hairlineWidth }}
              onPress={() => toggle(day)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={label}
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
