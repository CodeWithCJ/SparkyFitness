import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
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
import { FullWindowOverlay } from 'react-native-screens';
import { useUniwind, useCSSVariable } from 'uniwind';
import Icon from './Icon';

// Render the sheet inside an iOS UIWindow so it sits above any native modal
// presentation. No-op on Android.
const sheetContainer =
  Platform.OS === 'ios'
    ? ({ children }: React.PropsWithChildren) => <FullWindowOverlay>{children}</FullWindowOverlay>
    : undefined;

export interface PickerOption<T> {
  label: string;
  value: T;
}

export interface PickerSection<T> {
  title?: string;
  options: PickerOption<T>[];
}

interface BottomSheetPickerProps<T extends string | number> {
  value: T;
  options?: PickerOption<T>[];
  sections?: PickerSection<T>[];
  onSelect: (value: T) => void;
  placeholder?: string;
  title?: string;
  containerStyle?: StyleProp<ViewStyle>;
  renderTrigger?: (props: { onPress: () => void; selectedOption: PickerOption<T> | undefined }) => React.ReactNode;
}

function BottomSheetPicker<T extends string | number>({
  value,
  options,
  sections,
  onSelect,
  placeholder = 'Select an option',
  title,
  containerStyle,
  renderTrigger,
}: BottomSheetPickerProps<T>) {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const { theme } = useUniwind();
  const [primary, textMuted, surfaceBg] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-surface',
  ]) as [string, string, string];
  const isDarkMode = theme === 'dark' || theme === 'amoled';

  const normalizedSections = useMemo<PickerSection<T>[]>(() => {
    if (sections && sections.length > 0) {
      return sections;
    }
    return [{ options: options ?? [] }];
  }, [options, sections]);

  const flatOptions = useMemo(
    () => normalizedSections.flatMap((section) => section.options),
    [normalizedSections],
  );

  const selectedOption = flatOptions.find((opt) => opt.value === value);
  const displayText = selectedOption?.label || placeholder;

  // For long lists (>8 items), use a fixed max height with scrolling
  // For short lists, use dynamic sizing to fit content exactly
  const enableDynamic = flatOptions.length <= 8;
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

  const renderSectionHeader = (section: PickerSection<T>, index: number) => {
    if (!section.title) return null;

    return (
      <View
        key={`section-${section.title}-${index}`}
        className="px-4 py-2 bg-surface"
      >
        <Text className="text-xs font-semibold uppercase text-text-muted">
          {section.title}
        </Text>
      </View>
    );
  };

  const renderSections = () => normalizedSections.map((section, index) => (
    <React.Fragment key={`section-${section.title ?? 'default'}-${index}`}>
      {renderSectionHeader(section, index)}
      {section.options.map(renderOption)}
    </React.Fragment>
  ));

  return (
    <>
      {renderTrigger ? (
        renderTrigger({ onPress: handleOpen, selectedOption })
      ) : (
        <TouchableOpacity
          className="flex-row items-center justify-between px-3 py-2.5 rounded-lg border border-border-subtle bg-raised min-h-11"
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
      )}

      <BottomSheetModal
        ref={bottomSheetRef}
        snapPoints={snapPoints}
        enableDynamicSizing={enableDynamic}
        backdropComponent={renderBackdrop}
        containerComponent={sheetContainer}
        backgroundStyle={{ backgroundColor: surfaceBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
      >
        {enableDynamic ? (
          <BottomSheetView className="pb-safe-or-5">
            {title && (
              <View className="px-4 py-4 border-b border-border-subtle">
                <Text className="text-lg font-semibold text-center text-text-primary">
                  {title}
                </Text>
              </View>
            )}
            {renderSections()}
          </BottomSheetView>
        ) : (
          <BottomSheetScrollView contentContainerClassName="pb-safe-or-5">
            {title && (
              <View className="px-4 py-4 border-b border-border-subtle">
                <Text className="text-lg font-semibold text-center text-text-primary">
                  {title}
                </Text>
              </View>
            )}
            {renderSections()}
          </BottomSheetScrollView>
        )}
      </BottomSheetModal>
    </>
  );
}

export default BottomSheetPicker;
