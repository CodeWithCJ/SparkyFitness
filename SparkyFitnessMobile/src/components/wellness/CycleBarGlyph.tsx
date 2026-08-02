import React from 'react';
import { View } from 'react-native';
import { useWellnessTokens } from './theme/wellnessTokens';

interface CycleBarGlyphProps {
  cycleLength: number;
  periodLength: number;
  /**
   * Longest cycle in the surrounding list. Bars render at
   * cycleLength/maxLength of the row width so lengths compare across rows.
   */
  maxLength: number;
}

const CycleBarGlyph: React.FC<CycleBarGlyphProps> = ({
  cycleLength,
  periodLength,
  maxLength,
}) => {
  const tokens = useWellnessTokens();
  // Normalize lengths
  const len = Math.max(15, Math.min(90, cycleLength));
  const pLen = Math.max(1, Math.min(15, periodLength));
  const max = Math.max(len, Math.min(90, maxLength));

  return (
    // Full-width rail behind the bar: without it, near-equal cycle lengths
    // (27 vs 29 days) are indistinguishable because nothing marks 100%.
    <View testID="cycle-bar-rail" className="h-2.5 rounded-full bg-progress-rail">
      <View
        testID="cycle-bar-track"
        className="h-full rounded-full bg-progress-track overflow-hidden"
        style={{ width: `${(len / max) * 100}%` }}
      >
        {/* Period segment */}
        <View
          testID="cycle-bar-period"
          className="h-full rounded-full"
          style={{ width: `${(pLen / len) * 100}%`, backgroundColor: tokens.phaseMenstrual }}
        />
      </View>
    </View>
  );
};

export default CycleBarGlyph;
