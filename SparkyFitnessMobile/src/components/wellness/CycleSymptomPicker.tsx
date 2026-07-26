import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { BUILT_IN_CYCLE_SYMPTOMS, type CycleSymptomDef } from '@workspace/shared';
import { useSymptomEntries, useSymptomMutations } from '../../hooks/useSymptoms';
import CycleIcon from './CycleIcon';

interface CycleSymptomPickerProps {
  date: string;
}

const CycleSymptomPicker: React.FC<CycleSymptomPickerProps> = ({ date }) => {
  const { entries, isLoading } = useSymptomEntries({ fromDate: date, toDate: date });
  const { createEntry, deleteEntry } = useSymptomMutations(date, date);

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

          return (
            <TouchableOpacity
              key={s.name}
              onPress={() => handleToggleSymptom(s)}
              activeOpacity={0.7}
              className={`flex-row items-center rounded-full px-3 py-1.5 border ${
                isActive ? 'bg-accent-primary/10 border-accent-primary' : 'bg-raised border-border-subtle'
              }`}
            >
              <CycleIcon id={s.icon} size={16} />
              <Text
                className={`text-xs ml-1.5 ${
                  isActive ? 'text-text-primary font-bold' : 'text-text-secondary font-medium'
                }`}
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
