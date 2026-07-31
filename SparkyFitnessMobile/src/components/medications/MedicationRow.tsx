import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { formatDose, describeSchedules, type Medication } from '@workspace/shared';
import Icon from '../Icon';

interface MedicationRowProps {
  medication: Medication;
  onPress: () => void;
}

/**
 * One medication in the user's regimen: name plus a dose and
 * schedule summary, e.g. "1 tablet · Daily at 8:00 AM".
 */
const MedicationRow: React.FC<MedicationRowProps> = ({ medication, onPress }) => {
  const [iconDecorative] = useCSSVariable(['--color-icon-decorative']) as [string];

  const summary = [formatDose(medication), describeSchedules(medication.schedules ?? [])]
    .filter((part) => part != null && part !== '')
    .join(' · ');

  return (
    <TouchableOpacity
      className="py-3 px-4 bg-surface flex-row items-center"
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View className="flex-1">
        <Text
          className={`text-base ${medication.is_active ? 'text-text-primary' : 'text-text-muted'}`}
          numberOfLines={1}
        >
          {medication.name}
        </Text>
        {summary !== '' && (
          <Text className="text-xs text-text-secondary mt-1" numberOfLines={1}>{summary}</Text>
        )}
      </View>
      <Icon name="chevron-forward" size={16} color={iconDecorative} />
    </TouchableOpacity>
  );
};

export default MedicationRow;
