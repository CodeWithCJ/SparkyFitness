import React from 'react';
import { Text, View } from 'react-native';
import type { CompareSinceResponse } from '@workspace/shared';
import { useTranslation } from 'react-i18next';

import {
  sinceCaveat,
  sinceDetails,
  sinceVerdictCopy,
} from '../../utils/compareSinceCopy';
import { useEnergyUnit } from '../../hooks/useEnergyUnit';

interface CompareSinceCardProps {
  response: CompareSinceResponse;
}

/**
 * The since answer: the verdict, then how the outcome sat before and since,
 * the numbers behind it, and always the reminder that it is a change since
 * the start, not proof the habit caused it.
 */
const CompareSinceCard: React.FC<CompareSinceCardProps> = ({ response }) => {
  const { t } = useTranslation();
  const energyUnit = useEnergyUnit();
  const { headline, detail } = sinceVerdictCopy(response, t, energyUnit);
  const details = sinceDetails(response, t, energyUnit);
  const lines = [
    details.typicalRange,
    details.aboveLine,
    details.regularity,
    details.alreadyChanging,
  ].filter((line): line is string => line !== null);
  const caveat = sinceCaveat(
    { a: response.habit.key, b: response.outcome.key },
    t
  );

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <Text className="text-text-primary text-2xl font-bold">{headline}</Text>
      {detail ? (
        <Text
          testID="compare-since-detail"
          className="text-text-secondary text-base mt-2"
        >
          {detail}
        </Text>
      ) : null}
      {lines.map((line) => (
        <Text key={line} className="text-text-secondary text-sm mt-2">
          {line}
        </Text>
      ))}
      {details.stats ? (
        <Text className="text-text-muted text-xs mt-3">{details.stats}</Text>
      ) : null}
      <Text className="text-text-muted text-xs mt-3">{caveat}</Text>
    </View>
  );
};

export default CompareSinceCard;
