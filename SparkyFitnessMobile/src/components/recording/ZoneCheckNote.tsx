import React from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  isZoneCheckWorkout,
  type ProgramWorkout,
  type RunProgram,
} from '@workspace/shared';

/**
 * A line on the workout that is a Zone 2 zone check (the middle run of weeks
 * 4, 8 and 10): run it like the others, then compare pace at the same effort
 * with the last one. Nothing for any other workout.
 */
const ZoneCheckNote: React.FC<{
  program: RunProgram;
  workout: ProgramWorkout | null;
}> = ({ program, workout }) => {
  const { t } = useTranslation();
  if (!workout || !isZoneCheckWorkout(program.id, workout)) return null;
  return (
    <Text className="text-text-secondary text-xs mt-2" testID="zone-check-note">
      {t('recordActivity.zone2.zoneCheck', {
        defaultValue:
          'Zone check: run this one on a flat, familiar route at the same effort as last time, and note your pace and how easy it felt. If the same heart rate now gives a faster pace, your aerobic fitness is growing.',
      })}
    </Text>
  );
};

export default ZoneCheckNote;
