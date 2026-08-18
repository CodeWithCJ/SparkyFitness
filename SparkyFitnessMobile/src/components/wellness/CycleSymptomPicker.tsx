import React from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const { mode } = useCycleMode();
  const symptomLabels: Record<string, string> = {
    cramps: t('cycleSymptoms.items.cramps', { defaultValue: 'Cramps' }),
    headache: t('cycleSymptoms.items.headache', { defaultValue: 'Headache' }),
    migraine: t('cycleSymptoms.items.migraine', { defaultValue: 'Migraine' }),
    backache: t('cycleSymptoms.items.backache', { defaultValue: 'Backache' }),
    ovulation_pain: t('cycleSymptoms.items.ovulation_pain', { defaultValue: 'Ovulation pain' }),
    tender_breasts: t('cycleSymptoms.items.tender_breasts', { defaultValue: 'Tender breasts' }),
    nausea: t('cycleSymptoms.items.nausea', { defaultValue: 'Nausea' }),
    bloating: t('cycleSymptoms.items.bloating', { defaultValue: 'Bloating' }),
    diarrhea: t('cycleSymptoms.items.diarrhea', { defaultValue: 'Diarrhea' }),
    constipation: t('cycleSymptoms.items.constipation', { defaultValue: 'Constipation' }),
    cravings: t('cycleSymptoms.items.cravings', { defaultValue: 'Cravings' }),
    acne: t('cycleSymptoms.items.acne', { defaultValue: 'Acne' }),
    oily_skin: t('cycleSymptoms.items.oily_skin', { defaultValue: 'Oily skin' }),
    fatigue: t('cycleSymptoms.items.fatigue', { defaultValue: 'Fatigue' }),
    insomnia: t('cycleSymptoms.items.insomnia', { defaultValue: 'Insomnia' }),
    dizziness: t('cycleSymptoms.items.dizziness', { defaultValue: 'Dizziness' }),
    mood_swings: t('cycleSymptoms.items.mood_swings', { defaultValue: 'Mood swings' }),
    anxiety: t('cycleSymptoms.items.anxiety', { defaultValue: 'Anxiety' }),
    hot_flashes: t('cycleSymptoms.items.hot_flashes', { defaultValue: 'Hot flashes' }),
    spotting: t('cycleSymptoms.items.spotting', { defaultValue: 'Spotting' }),
    body_aches: t('cycleSymptoms.items.body_aches', { defaultValue: 'Body aches' }),
    joint_pain: t('cycleSymptoms.items.joint_pain', { defaultValue: 'Joint pain' }),
    muscle_soreness: t('cycleSymptoms.items.muscle_soreness', { defaultValue: 'Muscle soreness' }),
    pelvic_pain: t('cycleSymptoms.items.pelvic_pain', { defaultValue: 'Pelvic pain' }),
    cervical_pain: t('cycleSymptoms.items.cervical_pain', { defaultValue: 'Cervical pain' }),
    stiff_neck: t('cycleSymptoms.items.stiff_neck', { defaultValue: 'Stiff neck' }),
    digestive_cramps: t('cycleSymptoms.items.digestive_cramps', { defaultValue: 'Digestive cramps' }),
    acid_reflux: t('cycleSymptoms.items.acid_reflux', { defaultValue: 'Acid reflux' }),
    indigestion: t('cycleSymptoms.items.indigestion', { defaultValue: 'Indigestion' }),
    increased_appetite: t('cycleSymptoms.items.increased_appetite', { defaultValue: 'Increased appetite' }),
    decreased_appetite: t('cycleSymptoms.items.decreased_appetite', { defaultValue: 'Decreased appetite' }),
    fatigue_morning: t('cycleSymptoms.items.fatigue_morning', { defaultValue: 'Morning fatigue' }),
    brain_fog: t('cycleSymptoms.items.brain_fog', { defaultValue: 'Brain fog' }),
    irritability: t('cycleSymptoms.items.irritability', { defaultValue: 'Irritability' }),
    sadness: t('cycleSymptoms.items.sadness', { defaultValue: 'Sadness' }),
    oversleeping: t('cycleSymptoms.items.oversleeping', { defaultValue: 'Oversleeping' }),
    restless_sleep: t('cycleSymptoms.items.restless_sleep', { defaultValue: 'Restless sleep' }),
    dry_skin: t('cycleSymptoms.items.dry_skin', { defaultValue: 'Dry skin' }),
    skin_breakouts: t('cycleSymptoms.items.skin_breakouts', { defaultValue: 'Skin breakouts' }),
    chills: t('cycleSymptoms.items.chills', { defaultValue: 'Chills' }),
    night_sweats: t('cycleSymptoms.items.night_sweats', { defaultValue: 'Night sweats' }),
    swollen_feet: t('cycleSymptoms.items.swollen_feet', { defaultValue: 'Swollen feet' }),
    breast_swelling: t('cycleSymptoms.items.breast_swelling', { defaultValue: 'Breast swelling' }),
  };
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
        <Text className="text-text-primary text-sm font-semibold">{t('cycleSymptoms.title', { defaultValue: 'Symptoms' })}</Text>
        <TouchableOpacity onPress={() => setShowAll((v) => !v)} activeOpacity={0.7}>
          <Text className="text-accent-primary text-sm font-semibold">
            {showAll ? t('cycleSymptoms.showLess', { defaultValue: 'Show less' }) : t('cycleSymptoms.showAll', { defaultValue: 'Show all' })}
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
                {symptomLabels[s.name] ?? s.displayName}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export default CycleSymptomPicker;
