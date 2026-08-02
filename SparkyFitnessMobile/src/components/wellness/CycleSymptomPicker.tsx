import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { BUILT_IN_CYCLE_SYMPTOMS, type CycleSymptomDef } from '@workspace/shared';
import { useSymptomEntries, useSymptomMutations } from '../../hooks/useSymptoms';
import CycleIcon from './CycleIcon';

import { useCycleMode } from '../../hooks/useCycleMode';
import { useTranslation } from 'react-i18next';

interface CycleSymptomPickerProps {
  date: string;
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

const CycleSymptomPicker: React.FC<CycleSymptomPickerProps> = ({ date }) => {
  const { entries, isLoading } = useSymptomEntries({ fromDate: date, toDate: date });
  const { createEntry, deleteEntry } = useSymptomMutations(date, date);
  const { mode } = useCycleMode();
  const { t } = useTranslation();
  const isPregnant = mode === 'pregnant';
  const [showAll, setShowAll] = React.useState(false);

  const activeSymptomSnapshots = entries
    .filter((e) => e.source === 'cycle')
    .map((e) => e.symptom_name_snapshot.toLowerCase());

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
        severity: 3,
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
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-text-primary text-sm font-semibold">{t('mobileComponents.symptoms.title')}</Text>
        <TouchableOpacity onPress={() => setShowAll((v) => !v)} activeOpacity={0.7}>
          <Text className="text-accent-primary text-xs font-semibold">
            {showAll ? t('mobileComponents.symptoms.showLess') : t('mobileComponents.symptoms.showAll')}
          </Text>
        </TouchableOpacity>
      </View>

      <View className="flex-row flex-wrap gap-2">
        {displayedSymptoms.map((s) => {
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
