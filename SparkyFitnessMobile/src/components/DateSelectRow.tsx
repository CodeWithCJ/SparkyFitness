import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { formatDateLabel } from '../utils/dateUtils';

interface DateSelectRowProps {
  date: string;
  onPress: () => void;
}

/** Tappable "Date <label> v" row that opens the caller's calendar sheet. */
const DateSelectRow: React.FC<DateSelectRowProps> = ({ date, onPress }) => {
  const { t, i18n: translationI18n } = useTranslation();
  const dateLocale = translationI18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const [textPrimary] = useCSSVariable(['--color-text-primary']) as [string];

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="flex-row items-center self-start"
    >
      <Text className="text-text-secondary text-base">{t('common.date', { defaultValue: 'Date' })}</Text>
      <Text className="text-text-primary text-base font-medium mx-1.5">
        {formatDateLabel(date, t, dateLocale)}
      </Text>
      <Icon name="chevron-down" size={12} color={textPrimary} weight="medium" />
    </TouchableOpacity>
  );
};

export default DateSelectRow;
