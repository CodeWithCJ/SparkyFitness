import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { planMinutes, type ProgramStatus } from '@workspace/shared';
import Button from '../ui/Button';
import { programWorkoutLabel } from './RunProgramCard';

interface Props {
  /** The program in use, or null when there is none or it is switched off. */
  status: ProgramStatus | null;
  loaded: boolean;
  /** Whether today's program workout is the plan chosen for this recording. */
  selected: boolean;
  onSelect: () => void;
  /** Opens the Training programs screen. */
  onManage: () => void;
}

/**
 * The Record screen's view of a training program: today's workout, to use for
 * this recording. Choosing, starting and changing programs happens on the
 * Training programs screen in the Library.
 */
const RunProgramSelect: React.FC<Props> = ({
  status,
  loaded,
  selected,
  onSelect,
  onManage,
}) => {
  const { t } = useTranslation();
  if (!loaded) return null;

  if (!status || !status.workout) {
    return (
      <View
        className="flex-row items-center justify-between bg-surface rounded-xl p-4 mt-4"
        testID="run-program-select"
      >
        <Text className="text-text-primary text-sm font-semibold flex-1 mr-3">
          {t('runPrograms.select.none', { defaultValue: 'Training program' })}
        </Text>
        <Button variant="link" onPress={onManage}>
          {t('runPrograms.select.setUp', { defaultValue: 'Set up a program' })}
        </Button>
      </View>
    );
  }

  return (
    <View
      className="bg-surface rounded-xl p-4 mt-4"
      testID="run-program-select"
    >
      <Text className="text-text-secondary text-xs">
        {t('runPrograms.select.today', {
          defaultValue: "Today's program workout",
        })}
      </Text>
      <Text className="text-text-primary text-sm font-semibold mt-1">
        {programWorkoutLabel(t, status)}
        {' · '}
        {t('recordActivity.program.minutes', {
          minutes: planMinutes(status.workout.plan),
          defaultValue: '{{minutes}} min',
        })}
      </Text>
      <View className="flex-row items-center mt-3">
        <View className="flex-1 mr-2">
          <Button variant={selected ? 'primary' : 'outline'} onPress={onSelect}>
            {selected
              ? t('recordActivity.program.using', {
                  defaultValue: 'Using this workout',
                })
              : t('recordActivity.program.doThis', {
                  defaultValue: 'Do this workout',
                })}
          </Button>
        </View>
        <Button variant="link" onPress={onManage}>
          {t('runPrograms.select.manage', { defaultValue: 'Manage' })}
        </Button>
      </View>
    </View>
  );
};

export default RunProgramSelect;
