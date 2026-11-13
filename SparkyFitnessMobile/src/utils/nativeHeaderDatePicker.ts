import React from 'react';
import { Text } from 'react-native';
import type { NativeStackHeaderItem } from '@react-navigation/native-stack';
import { formatDateLabel } from './dateUtils';
import { createNativeHeaderIconButtonItem } from './nativeHeaderItems';

export type NativeHeaderDatePickerOptions = {
  selectedDate: string;
  onPreviousDate: () => void;
  onDatePress: () => void;
  onNextDate: () => void;
  tintColor: string;
  dateTintColor?: string;
  accessibilityLabel: string;
  previousDayLabel?: string;
  nextDayLabel?: string;
  dateLabel?: string;
  t: import('i18next').TFunction;
  locale: string;
  /**
   * Side-bar presentation (iPhone Duo): the date text becomes a plain label
   * (no pill, no arrow, not tappable) and a calendar icon button joins the
   * arrows. The icon opens the same picker the text button does elsewhere.
   */
  compactCalendarButton?: boolean;
  /**
   * Side bar only: not enough room for previous / calendar / next (a live
   * activity lengthened the status cluster), so keep just the calendar icon.
   */
  collapseToCalendar?: boolean;
  leadingAction?: {
    sfSymbol: string;
    onPress: () => void;
    accessibilityLabel: string;
    identifier: string;
  };
};

export type NativeHeaderDatePickerNavigation = {
  setOptions: (options: {
    unstable_headerRightItems: () => NativeStackHeaderItem[];
    unstable_headerLeftItems?: () => NativeStackHeaderItem[];
  }) => void;
};

export function setNativeHeaderDatePickerOptions(
  navigation: NativeHeaderDatePickerNavigation,
  options: NativeHeaderDatePickerOptions
) {
  const leadingAction = options.leadingAction;

  navigation.setOptions({
    unstable_headerRightItems: () => createNativeHeaderDatePickerItems(options),
    unstable_headerLeftItems: leadingAction
      ? () => [
          createNativeHeaderIconButtonItem({
            sfSymbol: leadingAction.sfSymbol,
            onPress: leadingAction.onPress,
            tintColor: options.tintColor,
            accessibilityLabel: leadingAction.accessibilityLabel,
            identifier: leadingAction.identifier,
          }),
        ]
      : undefined,
  });
}

export function createNativeHeaderDatePickerItems({
  selectedDate,
  onPreviousDate,
  onDatePress,
  onNextDate,
  tintColor,
  dateTintColor,
  accessibilityLabel,
  previousDayLabel,
  nextDayLabel,
  dateLabel,
  t,
  locale,
  compactCalendarButton = false,
  collapseToCalendar = false,
}: NativeHeaderDatePickerOptions): NativeStackHeaderItem[] {
  const calendarItem: NativeStackHeaderItem[] = compactCalendarButton
    ? [
        {
          type: 'button',
          label: '',
          icon: { type: 'sfSymbol', name: 'calendar' },
          onPress: onDatePress,
          tintColor,
          accessibilityLabel,
          identifier: 'date-picker-calendar',
          sharesBackground: true,
        },
      ]
    : [];
  const items: NativeStackHeaderItem[] = [
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
      tintColor: dateTintColor ?? tintColor,
      labelStyle: {
        fontSize: 15,
        fontWeight: '600',
        color: dateTintColor ?? tintColor,
      },
      accessibilityLabel,
      identifier: 'date-picker',
      sharesBackground: true,
    },
    ...calendarItem,
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
  if (!compactCalendarButton) return items;
  // Side bar: the label comes first so previous / calendar / next sit together
  // as one contiguous group. It is a custom item, so iOS draws no button, no
  // glass and no arrow — just the day the page is showing.
  const [previous, , calendar, next] = items;
  const dayLabel: NativeStackHeaderItem = {
    type: 'custom',
    hidesSharedBackground: true,
    element: React.createElement(
      Text,
      {
        accessibilityRole: 'header',
        style: {
          fontSize: 15,
          fontWeight: '600',
          color: dateTintColor ?? tintColor,
          paddingHorizontal: 12,
        },
      },
      formatDateLabel(selectedDate, t, locale)
    ),
  };
  return collapseToCalendar
    ? [dayLabel, calendar]
    : [dayLabel, previous, calendar, next];
}
