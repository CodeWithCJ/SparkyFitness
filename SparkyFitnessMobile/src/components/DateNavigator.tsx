import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { formatDateLabel, formatDate } from '../utils/dateUtils';

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
}

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
    <View style={{ paddingTop, paddingHorizontal: skipHorizontalPadding ? 0 : 16 }}
          className={`flex-row justify-between items-center ${compact ? 'pb-0' : 'pb-5'}`}>
      <Text className="text-2xl font-bold text-text-primary">{title}</Text>
      <View className="flex-row items-center">
        {!hideChevrons && (
          <TouchableOpacity onPress={onPreviousDay} className="p-2">
            <Icon name="chevron-back" size={18} color={secondaryTextColor} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onDatePress ?? onToday} className="flex-row items-center px-2">
          <Text className="text-text-primary text-lg font-medium">
            {dateLabel}
          </Text>
          {onDatePress && (
            <Icon name="chevron-down" size={14} color={primaryTextColor} style={{ marginLeft: 4 }} />
          )}
        </TouchableOpacity>
        {!hideChevrons && (
          <TouchableOpacity onPress={onNextDay} className="p-2">
            <Icon name="chevron-forward" size={18} color={secondaryTextColor} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default DateNavigator;
