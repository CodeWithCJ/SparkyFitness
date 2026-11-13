import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Icon from './Icon';

interface ExerciseHeartRateChipProps {
  /** The reading as shown, e.g. `141` or `128 (162)` for an average and max. */
  text: string;
  /** Spoken label, e.g. "Current heart rate for Bench Press". */
  accessibilityLabel: string;
  /** Color of the heart icon and the number. */
  color: string;
  /** Color of the number and unit; defaults to the secondary text color. */
  valueColor?: string;
}

/**
 * A heart-rate readout (icon, number, bpm) for an exercise: the saved average
 * on a finished workout, or the watch's live reading during one. The list
 * card and the focus view both render it.
 */
function ExerciseHeartRateChip({
  text,
  accessibilityLabel,
  color,
  valueColor,
}: ExerciseHeartRateChipProps) {
  const { t } = useTranslation();
  return (
    <View
      testID="exercise-heart-rate"
      className="flex-row items-center"
      accessibilityLabel={accessibilityLabel}
    >
      <Icon name="heart-rate" size={14} color={color} />
      <Text
        className="text-sm text-text-secondary ml-1"
        style={[
          { fontVariant: ['tabular-nums'] },
          valueColor != null ? { color: valueColor } : null,
        ]}
      >
        {text}{' '}
        {t('activeWorkout.exercise.heartRateUnit', { defaultValue: 'bpm' })}
      </Text>
    </View>
  );
}

export default React.memo(ExerciseHeartRateChip);
