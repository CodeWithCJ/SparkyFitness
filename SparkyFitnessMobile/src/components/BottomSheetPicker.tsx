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
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

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
  const { colors, isDarkMode } = useTheme();

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
        style={[styles.optionItem, { borderBottomColor: colors.border }]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.optionLabel,
            { color: colors.text },
            isSelected && styles.optionLabelSelected,
          ]}
        >
          {item.label}
        </Text>
        {isSelected && (
          <Ionicons name="checkmark" size={20} color={colors.primary} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.trigger,
          { backgroundColor: colors.inputBackground, borderColor: colors.border },
          containerStyle,
        ]}
        onPress={handleOpen}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={title || placeholder}
        accessibilityHint="Opens selection menu"
      >
        <Text style={[styles.triggerText, { color: colors.text }]}>
          {displayText}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <BottomSheetModal
        ref={bottomSheetRef}
        snapPoints={snapPoints}
        enableDynamicSizing={enableDynamic}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.textMuted }}
      >
        {enableDynamic ? (
          <BottomSheetView style={styles.listContent}>
            {title && (
              <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                  {title}
                </Text>
              </View>
            )}
            {options.map(renderOption)}
          </BottomSheetView>
        ) : (
          <BottomSheetScrollView contentContainerStyle={styles.listContent}>
            {title && (
              <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
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
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
  },
  triggerText: {
    fontSize: 16,
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 20,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionLabel: {
    fontSize: 16,
  },
  optionLabelSelected: {
    fontWeight: '600',
  },
});

export default BottomSheetPicker;
