import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
} from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { sheetContainer, useSheetBackdrop } from './ui/sheetChrome';

export interface PickerOption<T> {
  label: string;
  value: T;
}

interface PickerTriggerProps {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * The dropdown-style control BottomSheetPicker renders when no custom trigger
 * is supplied. Exported so settings rows backed by a different sheet (e.g.
 * RestPeriodSheet) present the same control.
 */
export function PickerTrigger({
  label,
  onPress,
  accessibilityLabel,
  accessibilityHint = undefined,
  containerStyle,
}: PickerTriggerProps) {
  const { t } = useTranslation();
  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];
  return (
    <TouchableOpacity
      className="flex-row items-center justify-between px-3 py-2.5 rounded-lg border border-border-subtle bg-raised min-h-11"
      style={containerStyle}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint ?? t('common.openSelectionMenu', { defaultValue: 'Opens selection menu' })}
    >
      <Text className="text-base flex-1 text-text-primary">{label}</Text>
      <Icon name="chevron-down" size={16} color={textMuted} />
    </TouchableOpacity>
  );
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
  accessibilityHint?: string;
  containerStyle?: StyleProp<ViewStyle>;
  renderTrigger?: (props: { onPress: () => void; selectedOption: PickerOption<T> | undefined }) => React.ReactNode;
}

function BottomSheetPicker<T extends string | number>({
  value,
  options,
  sections,
  onSelect,
  placeholder = '',
  title,
  accessibilityHint,
  containerStyle,
  renderTrigger,
}: BottomSheetPickerProps<T>) {
  const { t } = useTranslation();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const [primary, textMuted, surfaceBg] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-surface',
  ]) as [string, string, string];

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
  const displayText = selectedOption?.label || placeholder || t('common.selectOption', { defaultValue: 'Select an option' });

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

  const renderBackdrop = useSheetBackdrop();

  const renderOption = (item: PickerOption<T>) => {
    const isSelected = item.value === value;
    return (
      <TouchableOpacity
        key={String(item.value)}
        className="flex-row items-center justify-between px-4 py-3.5 border-b border-border-subtle"
        style={{ borderBottomWidth: StyleSheet.hairlineWidth }}
        onPress={() => handleSelect(item)}
        activeOpacity={0.7}
        accessibilityRole="radio"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: isSelected }}
        accessibilityHint={t('common.selectOptionHint', {
          defaultValue: 'Double tap to select this option',
        })}
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
        // renderTrigger is a render prop; invoking it during render is intended.
        // handleOpen closes over bottomSheetRef but only reads it inside the
        // deferred onPress, so no ref is actually accessed during render.
        // eslint-disable-next-line react-hooks/refs
        renderTrigger({ onPress: handleOpen, selectedOption })
      ) : (
        <PickerTrigger
          label={displayText}
          onPress={handleOpen}
          accessibilityLabel={title || placeholder}
          accessibilityHint={accessibilityHint}
          containerStyle={containerStyle}
        />
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
