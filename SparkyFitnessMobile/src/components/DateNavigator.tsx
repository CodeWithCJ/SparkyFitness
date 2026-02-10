import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { formatDateLabel, formatDate, getTodayDate } from '../utils/dateUtils';

interface DateNavigatorProps {
  title: string;
  selectedDate: string;
  onPreviousDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onDatePress?: () => void;
  hideChevrons?: boolean;
  showDateAlways?: boolean;
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
}) => {
  const insets = useSafeAreaInsets();
  const secondaryTextColor = useCSSVariable('--color-text-secondary') as string;
  const primaryTextColor = useCSSVariable('--color-text-primary') as string;
  const isToday = selectedDate === getTodayDate();

  const dateLabel = showDateAlways
    ? formatDate(selectedDate)
    : formatDateLabel(selectedDate);

  return (
    <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16 }}
          className="flex-row justify-between items-center pb-4">
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
          <TouchableOpacity onPress={onNextDay} disabled={isToday}
                            className="p-2" style={isToday ? { opacity: 0.3 } : undefined}>
            <Icon name="chevron-forward" size={18} color={secondaryTextColor} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default DateNavigator;
