import type { NativeStackHeaderItem } from '@react-navigation/native-stack';
import { formatDateLabel } from './dateUtils';

export type NativeHeaderDatePickerOptions = {
  selectedDate: string;
  onPreviousDate: () => void;
  onDatePress: () => void;
  onNextDate: () => void;
  tintColor: string;
  accessibilityLabel: string;
};

export type NativeHeaderDatePickerNavigation = {
  setOptions: (options: {
    unstable_headerRightItems: () => NativeStackHeaderItem[];
  }) => void;
};

export function setNativeHeaderDatePickerOptions(
  navigation: NativeHeaderDatePickerNavigation,
  options: NativeHeaderDatePickerOptions,
) {
  navigation.setOptions({
    unstable_headerRightItems: () =>
      createNativeHeaderDatePickerItems(options),
  });
}

export function createNativeHeaderDatePickerItems({
  selectedDate,
  onPreviousDate,
  onDatePress,
  onNextDate,
  tintColor,
  accessibilityLabel,
}: NativeHeaderDatePickerOptions): NativeStackHeaderItem[] {
  return [
    {
      type: 'button',
      label: '',
      icon: { type: 'sfSymbol', name: 'chevron.left' },
      onPress: onPreviousDate,
      tintColor,
      accessibilityLabel: `${accessibilityLabel}: previous day`,
      identifier: 'date-picker-previous',
      sharesBackground: true,
      disabled: false,
    },
    {
      type: 'button',
      label: `${formatDateLabel(selectedDate)} ▾`,
      onPress: onDatePress,
      tintColor,
      labelStyle: { fontSize: 15, fontWeight: '600', color: tintColor },
      accessibilityLabel,
      identifier: 'date-picker',
      sharesBackground: true,
    },
    {
      type: 'button',
      label: '',
      icon: { type: 'sfSymbol', name: 'chevron.right' },
      onPress: onNextDate,
      tintColor,
      accessibilityLabel: `${accessibilityLabel}: next day`,
      identifier: 'date-picker-next',
      sharesBackground: true,
      disabled: false,
    },
  ];
}
