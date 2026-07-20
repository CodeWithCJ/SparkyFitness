import React from 'react';
import { View } from 'react-native';
import { useWellnessTokens } from './theme/wellnessTokens';

interface CycleBarGlyphProps {
  cycleLength: number;
  periodLength: number;
  showFertile?: boolean;
}

const CycleBarGlyph: React.FC<CycleBarGlyphProps> = ({
  cycleLength,
  periodLength,
  showFertile = true,
}) => {
  const tokens = useWellnessTokens();
  // Normalize lengths
  const len = Math.max(15, Math.min(90, cycleLength));
  const pLen = Math.max(1, Math.min(15, periodLength));

  // Percentages
  const periodWidth = `${(pLen / len) * 100}%`;

  // Fertile window: ovulation is cycleLength - 14. Fertile is ovulation - 5 to ovulation + 1
  const fertileStartDay = len - 19;
  const fertileEndDay = len - 13;

  const showFertileBlock = showFertile && fertileStartDay > pLen && fertileEndDay < len;
  const fertileLeft = `${(fertileStartDay / len) * 100}%`;
  const fertileWidth = `${((fertileEndDay - fertileStartDay + 1) / len) * 100}%`;

  return (
    <View className="relative w-full h-2.5 rounded-full bg-raised overflow-hidden">
      {/* Period segment */}
      <View
        className="absolute top-0 left-0 h-full rounded-full"
        style={{ width: periodWidth as any, backgroundColor: tokens.phaseMenstrual }}
      />
      {/* Fertile segment */}
      {showFertileBlock && (
        <View
          className="absolute top-0 h-full rounded-full opacity-60"
          style={{ left: fertileLeft as any, width: fertileWidth as any, backgroundColor: tokens.phaseFollicular }}
        />
      )}
    </View>
  );
};

export default CycleBarGlyph;
