import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { BUILT_IN_CYCLE_SYMPTOMS, SYMPTOM_CATEGORY_COLOR, type CycleSymptomDef } from '@workspace/shared';
import { useSymptomEntries, useSymptomMutations } from '../../hooks/useSymptoms';
import { useWellnessTokens, resolveSymptomCategoryColor } from './theme/wellnessTokens';
import CycleIcon from './CycleIcon';

interface CycleSymptomPickerProps {
  date: string;
}

const CycleSymptomPicker: React.FC<CycleSymptomPickerProps> = ({ date }) => {
  const { entries, isLoading } = useSymptomEntries({ fromDate: date, toDate: date });
  const { createEntry, deleteEntry } = useSymptomMutations(date, date);
  const tokens = useWellnessTokens();
  const [textMuted, textPrimary] = useCSSVariable([
    '--color-text-muted',
    '--color-text-primary',
  ]) as [string, string];

  const activeSymptomSnapshots = entries
    .filter((e) => e.source === 'cycle')
    .map((e) => e.symptom_name_snapshot.toLowerCase());

  const handleToggleSymptom = (symptom: CycleSymptomDef) => {
    const name = symptom.displayName.toLowerCase();
    const existing = entries.find(
      (e) => e.source === 'cycle' && e.symptom_name_snapshot.toLowerCase() === name
    );

    if (existing && existing.id) {
      deleteEntry(existing.id);
    } else {
      createEntry({
        symptom_name_snapshot: symptom.displayName,
        severity: 3, // default severity
        source: 'cycle',
        entry_date: date,
      });
    }
  };

  if (isLoading) {
    return (
      <View className="py-4 items-center justify-center">
        <ActivityIndicator size="small" />
      </View>
    );
  }

  return (
    <View className="gap-2">
      <Text className="text-text-primary text-sm font-semibold mb-1">Symptoms</Text>
      <View className="flex-row flex-wrap gap-2">
        {BUILT_IN_CYCLE_SYMPTOMS.map((s) => {
          const isActive = activeSymptomSnapshots.includes(s.displayName.toLowerCase());
          const catColor = resolveSymptomCategoryColor(
            SYMPTOM_CATEGORY_COLOR[s.category],
            tokens,
            textMuted,
          );

          return (
            <TouchableOpacity
              key={s.name}
              onPress={() => handleToggleSymptom(s)}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isActive ? catColor : 'rgba(150,150,150,0.1)',
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: isActive ? catColor : 'transparent',
              }}
            >
              <CycleIcon id={s.icon} size={18} />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '500',
                  color: isActive ? '#FFFFFF' : textPrimary,
                  marginLeft: 6,
                }}
              >
                {s.displayName}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export default CycleSymptomPicker;
