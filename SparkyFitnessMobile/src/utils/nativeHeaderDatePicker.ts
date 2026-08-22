import type { NativeStackHeaderItem } from '@react-navigation/native-stack';
import { formatDateLabel } from './dateUtils';

export type NativeHeaderDatePickerOptions = {
  selectedDate: string;
  onPreviousDate: () => void;
  onDatePress: () => void;
  onNextDate: () => void;
  tintColor: string;
  accessibilityLabel: string;
  previousDayLabel?: string;
  nextDayLabel?: string;
  dateLabel?: string;
  t: import('i18next').TFunction;
  locale: string;
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
  previousDayLabel,
  nextDayLabel,
  dateLabel,
  t,
  locale,
}: NativeHeaderDatePickerOptions): NativeStackHeaderItem[] {
  return [
    {
      type: 'button',
      label: '',
      icon: { type: 'sfSymbol', name: 'chevron.left' },
      onPress: onPreviousDate,
      tintColor,
      // i18n-audit-ignore-next-line hardcoded-ui-text -- legacy API fallback; production callers pass localized previousDayLabel.
      accessibilityLabel: `${accessibilityLabel}${previousDayLabel ?? ': previous day'}`,
      identifier: 'date-picker-previous',
      sharesBackground: true,
      disabled: false,
    },
    {
      type: 'button',
      label: dateLabel ?? `${formatDateLabel(selectedDate, t, locale)} ▾`,
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
      // i18n-audit-ignore-next-line hardcoded-ui-text -- legacy API fallback; production callers pass localized nextDayLabel.
      accessibilityLabel: `${accessibilityLabel}${nextDayLabel ?? ': next day'}`,
      identifier: 'date-picker-next',
      sharesBackground: true,
      disabled: false,
    },
  ];
}
