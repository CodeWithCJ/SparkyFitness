import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import Icon from '../Icon';
import { useProgramWorkoutForEntry } from '../../services/runProgramService';
import { programWorkoutLabel } from './RunProgramCard';

/**
 * Says that a logged activity was a workout of the person's training program,
 * and which one ("Couch to 5K · Week 3, run 2"). Renders nothing for an
 * activity the program has no record of.
 */
const ProgramWorkoutBadge: React.FC<{ entryId: string | undefined }> = ({
  entryId,
}) => {
  const { t } = useTranslation();
  const [accent] = useCSSVariable(['--color-accent-primary']) as [string];
  const status = useProgramWorkoutForEntry(entryId);
  if (!status) return null;
  return (
    <View
      className="bg-surface rounded-xl px-4 py-3 mb-4 shadow-sm flex-row items-center gap-2"
      testID="program-workout-badge"
    >
      <Icon name="calendar" size={16} color={accent || '#3B82F6'} />
      <View className="flex-1">
        <Text className="text-xs font-semibold text-text-secondary">
          {t('runPrograms.partOfProgram', {
            defaultValue: 'Part of your training program',
          })}
        </Text>
        <Text className="text-sm text-text-primary" numberOfLines={2}>
          {programWorkoutLabel(t, status)}
        </Text>
      </View>
    </View>
  );
};

export default ProgramWorkoutBadge;
