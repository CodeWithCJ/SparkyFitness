import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { BUILT_IN_CYCLE_SYMPTOMS, type CycleSymptomDef } from '@workspace/shared';
import CycleIcon from './CycleIcon';

import { useCycleMode } from '../../hooks/useCycleMode';

interface CycleSymptomPickerProps {
  /** Draft selection of symptom display names; owned by the parent form. */
  selected: string[];
  onToggle: (symptom: CycleSymptomDef) => void;
  loading?: boolean;
}

const PREGNANCY_TOP_SYMPTOMS = [
  'nausea',
  'fatigue',
  'backache',
  'tender_breasts',
  'swollen_feet',
  'acid_reflux',
  'bloating',
  'cravings',
  'mood_swings',
  'dizziness',
  'headache',
  'brain_fog',
];

const STANDARD_TOP_SYMPTOMS = [
  'cramps',
  'headache',
  'bloating',
  'mood_swings',
  'fatigue',
  'backache',
  'tender_breasts',
  'acne',
  'cravings',
  'nausea',
  'insomnia',
  'spotting',
];

/**
 * Presentational symptom chip grid. Selection state lives in the parent form
 * and is persisted by the screen-level Save action, not on tap.
 */
const CycleSymptomPicker: React.FC<CycleSymptomPickerProps> = ({ selected, onToggle, loading }) => {
  const { mode } = useCycleMode();
  const isPregnant = mode === 'pregnant';
  const [showAll, setShowAll] = React.useState(false);

  const activeSymptomSnapshots = selected.map((s) => s.toLowerCase());

  const displayedSymptoms = React.useMemo(() => {
    const topList = isPregnant ? PREGNANCY_TOP_SYMPTOMS : STANDARD_TOP_SYMPTOMS;
    const base = isPregnant
      ? BUILT_IN_CYCLE_SYMPTOMS.filter((s) => s.name !== 'ovulation_pain' && s.name !== 'spotting')
      : BUILT_IN_CYCLE_SYMPTOMS;

    if (showAll) return base;

    // Show top symptoms + any symptom that is currently active/logged
    return base.filter(
      (s) => topList.includes(s.name) || activeSymptomSnapshots.includes(s.displayName.toLowerCase())
    );
  }, [isPregnant, showAll, activeSymptomSnapshots]);

  if (loading) {
    return (
      <View className="py-4 items-center justify-center">
        <ActivityIndicator size="small" />
      </View>
    );
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-text-primary text-sm font-semibold">Symptoms</Text>
        <TouchableOpacity onPress={() => setShowAll((v) => !v)} activeOpacity={0.7}>
          <Text className="text-accent-primary text-sm font-semibold">
            {showAll ? 'Show less' : 'Show all'}
          </Text>
        </TouchableOpacity>
      </View>

      <View className="flex-row flex-wrap gap-2">
        {displayedSymptoms.map((s) => {
          const isActive = activeSymptomSnapshots.includes(s.displayName.toLowerCase());

          return (
            <TouchableOpacity
              key={s.name}
              onPress={() => onToggle(s)}
              activeOpacity={0.7}
              className={`flex-row items-center rounded-full px-3.5 py-2 border ${
                isActive ? 'bg-accent-primary/10 border-accent-primary' : 'bg-raised border-border-subtle'
              }`}
            >
              <CycleIcon id={s.icon} size={20} />
              <Text
                className={`text-sm ml-2 ${
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
