import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useUniwind, useCSSVariable } from 'uniwind';
import Icon from './Icon';

export interface PickerOption<T> {
  label: string;
  value: T;
}

interface BottomSheetPickerProps<T extends string | number> {
  value: T;
  options: PickerOption<T>[];
  onSelect: (value: T) => void;
  placeholder?: string;
  title?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

function BottomSheetPicker<T extends string | number>({
  value,
  options,
  onSelect,
  placeholder = 'Select an option',
  title,
  containerStyle,
}: BottomSheetPickerProps<T>) {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const { theme } = useUniwind();
  const [primary, textMuted, sectionBg] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-section',
  ]) as [string, string, string];
  const isDarkMode = theme === 'dark' || theme === 'amoled';

  const selectedOption = options.find((opt) => opt.value === value);
  const displayText = selectedOption?.label || placeholder;

  // For long lists (>8 items), use a fixed max height with scrolling
  // For short lists, use dynamic sizing to fit content exactly
  const enableDynamic = options.length <= 8;
  const snapPoints = useMemo(() => {
    return enableDynamic ? undefined : [500];
  }, [enableDynamic]);

  const handleSelect = useCallback(
    (item: PickerOption<T>) => {
      bottomSheetRef.current?.dismiss();
      onSelect(item.value);
    },
    [onSelect]
  );

  const handleOpen = useCallback(() => {
    bottomSheetRef.current?.present();
  }, []);

  // Cleanup on unmount (handles conditional rendering in SyncFrequency)
  useEffect(() => {
    const sheetRef = bottomSheetRef.current;
    return () => {
      sheetRef?.dismiss();
    };
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        opacity={isDarkMode ? 0.7 : 0.5}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    [isDarkMode]
  );

  const renderOption = (item: PickerOption<T>) => {
    const isSelected = item.value === value;
    return (
      <TouchableOpacity
        key={String(item.value)}
        className="flex-row items-center justify-between px-4 py-3.5 border-b border-border-subtle"
        style={{ borderBottomWidth: StyleSheet.hairlineWidth }}
        onPress={() => handleSelect(item)}
        activeOpacity={0.7}
      >
        <Text
          className={`text-base text-text-primary ${isSelected ? 'font-semibold' : ''}`}
        >
          {item.label}
        </Text>
        {isSelected && (
          <Icon name="checkmark" size={20} color={primary} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <>
      <TouchableOpacity
        className="flex-row items-center justify-between px-3 py-2.5 rounded-lg border border-border-subtle bg-card min-h-11"
        style={containerStyle}
        onPress={handleOpen}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={title || placeholder}
        accessibilityHint="Opens selection menu"
      >
        <Text className="text-base flex-1 text-text-primary">
          {displayText}
        </Text>
        <Icon name="chevron-down" size={16} color={textMuted} />
      </TouchableOpacity>

      <BottomSheetModal
        ref={bottomSheetRef}
        snapPoints={snapPoints}
        enableDynamicSizing={enableDynamic}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: sectionBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
      >
        {enableDynamic ? (
          <BottomSheetView className="pb-5">
            {title && (
              <View className="px-4 py-4 border-b border-border-subtle">
                <Text className="text-lg font-semibold text-center text-text-primary">
                  {title}
                </Text>
              </View>
            )}
            {options.map(renderOption)}
          </BottomSheetView>
        ) : (
          <BottomSheetScrollView contentContainerStyle={styles.listContent}>
            {title && (
              <View className="px-4 py-4 border-b border-border-subtle">
                <Text className="text-lg font-semibold text-center text-text-primary">
                  {title}
                </Text>
              </View>
            )}
            {options.map(renderOption)}
          </BottomSheetScrollView>
        )}
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 20,
  },
});

export default BottomSheetPicker;
