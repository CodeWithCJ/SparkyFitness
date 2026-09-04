import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity } from 'react-native';

import {
  formatWeightDisplay,
  type WeightDisplayMode,
} from '../utils/unitConversions';

interface PhotoDayWeightProps {
  /** Stored weight in kg, or null when the day has none. */
  weight: number | null;
  mode: WeightDisplayMode;
  onLogWeight: () => void;
  className?: string;
}

/**
 * The weight under a progress photo, falling back to a prompt that logs one.
 *
 * Renders nested inside the gallery row's own touchable: React Native's
 * responder system hands the touch to the innermost target, so tapping the
 * prompt logs weight rather than also opening the photo.
 */
const PhotoDayWeight: React.FC<PhotoDayWeightProps> = ({
  weight,
  mode,
  onLogWeight,
  className = 'text-text-secondary text-sm',
}) => {
  const { t } = useTranslation();

  if (weight != null) {
    return (
      <Text className={className}>{formatWeightDisplay(weight, mode)}</Text>
    );
  }

  return (
    <TouchableOpacity
      onPress={onLogWeight}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t('progressPhotos.logWeightA11y', {
        defaultValue: 'Log your weight for this day',
      })}
      hitSlop={8}
    >
      <Text className={`${className} text-accent-primary font-medium`}>
        {t('progressPhotos.logWeight', { defaultValue: 'Log weight' })}
      </Text>
    </TouchableOpacity>
  );
};

export default PhotoDayWeight;
