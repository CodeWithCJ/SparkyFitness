import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useMeasurements } from '../../../hooks/useMeasurements';
import { useUpsertCheckIn } from '../../../hooks/useUpsertCheckIn';
import { usePreferences } from '../../../hooks/usePreferences';
import { weightFromKg, weightToKg } from '../../../utils/unitConversions';
import { getTodayDate } from '../../../utils/dateUtils';
import FormInput from '../../FormInput';
import Icon from '../../Icon';
import type { SharedPregnancy } from '../../../types/womensHealth';

interface VitalsCardProps {
  pregnancy: SharedPregnancy;
}

const VitalsCard: React.FC<VitalsCardProps> = ({ pregnancy }) => {
  const today = getTodayDate();
  const { measurements, isLoading } = useMeasurements({ date: today });
  const upsertCheckIn = useUpsertCheckIn();
  const { preferences } = usePreferences();
  const weightUnit: 'kg' | 'lbs' = preferences?.default_weight_unit === 'lbs' ? 'lbs' : 'kg';
  const [accentColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const displayValue =
    measurements?.weight != null
      ? String(Math.round(weightFromKg(measurements.weight, weightUnit) * 10) / 10)
      : '';

  const startEditing = () => {
    setDraft(displayValue);
    setEditing(true);
  };

  const handleSave = () => {
    const value = parseFloat(draft);
    if (isNaN(value)) {
      setEditing(false);
      return;
    }
    upsertCheckIn.mutate({ entryDate: today, weight: weightToKg(value, weightUnit) });
    setEditing(false);
  };

  const displayWeight = displayValue ? `${displayValue} ${weightUnit}` : '—';

  return (
    <View className="bg-surface rounded-2xl p-4 border border-border-subtle shadow-sm gap-3">
      <Text className="text-text-primary text-base font-bold">Vitals</Text>

      <View className="flex-row items-center justify-between">
        <Text className="text-text-secondary text-sm">Today&apos;s weight</Text>
        {isLoading ? (
          <ActivityIndicator size="small" color={accentColor} />
        ) : editing ? (
          <View className="flex-row items-center gap-2">
            <FormInput
              value={draft}
              onChangeText={setDraft}
              keyboardType="decimal-pad"
              placeholder={weightUnit}
              style={{ width: 80 }}
              autoFocus
            />
            <TouchableOpacity onPress={handleSave} hitSlop={8} testID="vitals-weight-save">
              <Icon name="checkmark" size={20} color={accentColor} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={startEditing} className="flex-row items-center gap-1">
            <Text className="text-text-primary text-base font-semibold">{displayWeight}</Text>
            <Icon name="pencil" size={14} color={textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View className="h-px bg-border-subtle" />

      <View className="flex-row items-center justify-between">
        <Text className="text-text-secondary text-sm">Prenatal vitamin</Text>
        <Text className="text-text-primary text-sm font-semibold">
          {pregnancy.prenatal_medication_id ? 'Linked' : 'Not set'}
        </Text>
      </View>
      <View className="flex-row items-center justify-between">
        <Text className="text-text-secondary text-sm">Supplement</Text>
        <Text className="text-text-primary text-sm font-semibold">
          {pregnancy.supplement_medication_id ? 'Linked' : 'Not set'}
        </Text>
      </View>
    </View>
  );
};

export default VitalsCard;
