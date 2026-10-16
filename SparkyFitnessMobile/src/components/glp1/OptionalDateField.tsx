import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import CalendarSheet, { type CalendarSheetRef } from '../CalendarSheet';
import { formatDateLabel, getTodayDate } from '../../utils/dateUtils';

interface OptionalDateFieldProps {
  label: string;
  /** 'YYYY-MM-DD', or '' when unset. */
  value: string;
  onChange: (value: string) => void;
}

/** Labeled calendar-day field that can be left empty. */
const OptionalDateField: React.FC<OptionalDateFieldProps> = ({
  label,
  value,
  onChange,
}) => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const sheetRef = useRef<CalendarSheetRef>(null);

  return (
    <View className="gap-1.5">
      <Text className="text-text-secondary text-sm font-medium">{label}</Text>
      <View className="flex-row items-center justify-between px-3 py-2.5 rounded-lg border border-border-subtle bg-raised min-h-11">
        <TouchableOpacity
          className="flex-1"
          onPress={() => sheetRef.current?.present()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Text
            className={`text-base ${value ? 'text-text-primary' : 'text-text-muted'}`}
          >
            {value
              ? formatDateLabel(value, t, dateLocale)
              : t('medications.glp1.form.notSet', { defaultValue: 'Not set' })}
          </Text>
        </TouchableOpacity>
        {value !== '' && (
          <TouchableOpacity
            onPress={() => onChange('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
          >
            <Text className="text-sm font-semibold text-accent-primary">
              {t('medications.glp1.form.clear', { defaultValue: 'Clear' })}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <CalendarSheet
        ref={sheetRef}
        selectedDate={value || getTodayDate()}
        onSelectDate={(d) => {
          onChange(d);
          sheetRef.current?.dismiss();
        }}
      />
    </View>
  );
};

export default OptionalDateField;
