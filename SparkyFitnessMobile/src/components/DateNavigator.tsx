import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import type { IconName } from './Icon';
import { formatDateLabel, formatDate } from '../utils/dateUtils';
import type { DateLabelOptions } from '../utils/dateUtils';

interface DateNavigatorProps {
  title: string;
  selectedDate: string;
  onPreviousDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onDatePress?: () => void;
  hideChevrons?: boolean;
  showDateAlways?: boolean;
  skipTopInset?: boolean;
  skipHorizontalPadding?: boolean;
  compact?: boolean;
  action?: {
    icon: IconName;
    accessibilityLabel: string;
    onPress: () => void;
  };
  dateControls?: {
    previousDayLabel: string;
    previousDayHint: string;
    nextDayLabel: string;
    nextDayHint: string;
    chooseDateLabel: string;
    chooseDateHint: string;
    goToTodayLabel: string;
    goToTodayHint: string;
  };
  dateFormat?: DateLabelOptions;
}

const defaultDateControls = {
  previousDayLabel: 'Previous day',
  previousDayHint: 'Shows the previous day',
  nextDayLabel: 'Next day',
  nextDayHint: 'Shows the next day',
  chooseDateLabel: 'Choose date',
  chooseDateHint: 'Opens the date picker',
  goToTodayLabel: 'Go to today',
  goToTodayHint: 'Returns to today',
};

const DateNavigator: React.FC<DateNavigatorProps> = ({
  title,
  selectedDate,
  onPreviousDay,
  onNextDay,
  onToday,
  onDatePress,
  hideChevrons,
  showDateAlways,
  skipTopInset,
  skipHorizontalPadding,
  compact,
  action,
  dateControls = defaultDateControls,
  dateFormat,
}) => {
  // Subscribe to the reactive app language so the date label re-localizes
  // immediately on a runtime PL <-> EN switch without an app restart.
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const insets = useSafeAreaInsets();
  const secondaryTextColor = useCSSVariable('--color-text-secondary') as string;
  const primaryTextColor = useCSSVariable('--color-text-primary') as string;

  const dateLabel = showDateAlways
    ? formatDate(selectedDate, locale)
    : formatDateLabel(selectedDate, t, locale);

  const paddingTop = compact ? 0 : skipTopInset ? 16 : insets.top + 16;

  return (
    <View
      style={{ paddingTop, paddingHorizontal: skipHorizontalPadding ? 0 : 16 }}
      className={`flex-row justify-between items-center ${
        compact ? 'pb-0' : 'pb-5'
      }`}
    >
      <View className="flex-row items-center">
        <Text className="text-2xl font-bold text-text-primary">{title}</Text>
        {action ? (
          <TouchableOpacity
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            className="ml-2 items-center justify-center"
            style={{ width: 44, height: 44 }}
          >
            <Icon name={action.icon} size={22} color={primaryTextColor} />
          </TouchableOpacity>
        ) : null}
      </View>
      <View className="flex-row items-center">
        {!hideChevrons && (
          <TouchableOpacity
            onPress={onPreviousDay}
            accessibilityRole="button"
            accessibilityLabel={dateControls.previousDayLabel}
            accessibilityHint={dateControls.previousDayHint}
            className="items-center justify-center"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <Icon name="chevron-back" size={18} color={secondaryTextColor} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={onDatePress ?? onToday}
          accessibilityRole="button"
          accessibilityLabel={
            onDatePress
              ? dateControls.chooseDateLabel
              : dateControls.goToTodayLabel
          }
          accessibilityHint={
            onDatePress
              ? dateControls.chooseDateHint
              : dateControls.goToTodayHint
          }
          className="flex-row items-center justify-center px-2"
          style={{ minWidth: 44, minHeight: 44 }}
        >
          <Text className="text-text-primary text-lg font-medium">
            {dateLabel}
          </Text>
          {onDatePress && (
            <Icon
              name="chevron-down"
              size={14}
              color={primaryTextColor}
              style={{ marginLeft: 4 }}
            />
          )}
        </TouchableOpacity>
        {!hideChevrons && (
          <TouchableOpacity
            onPress={onNextDay}
            accessibilityRole="button"
            accessibilityLabel={dateControls.nextDayLabel}
            accessibilityHint={dateControls.nextDayHint}
            className="items-center justify-center"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <Icon name="chevron-forward" size={18} color={secondaryTextColor} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default DateNavigator;
