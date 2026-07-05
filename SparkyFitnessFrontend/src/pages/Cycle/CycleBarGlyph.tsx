interface CycleBarGlyphProps {
  cycleLength: number;
  periodLength: number;
  showFertile?: boolean;
}

export default function CycleBarGlyph({
  cycleLength,
  periodLength,
  showFertile = true,
}: CycleBarGlyphProps) {
  // Normalize lengths
  const len = Math.max(15, Math.min(90, cycleLength));
  const pLen = Math.max(1, Math.min(15, periodLength));

  // Percentages
  const periodWidth = (pLen / len) * 100;

  // Fertile window: ovulation is cycleLength - 14. Fertile is ovulation - 5 to ovulation + 1
  // cycleLength - 19 to cycleLength - 13
  const fertileStartDay = len - 19;
  const fertileEndDay = len - 13;

  const showFertileBlock =
    showFertile && fertileStartDay > pLen && fertileEndDay < len;
  const fertileLeft = (fertileStartDay / len) * 100;
  const fertileWidth = ((fertileEndDay - fertileStartDay + 1) / len) * 100;

  return (
    <div className="relative w-full h-2.5 rounded-full bg-muted overflow-hidden">
      {/* Period segment (Red) */}
      <div
        className="absolute top-0 left-0 h-full bg-red-500 rounded-full"
        style={{ width: `${periodWidth}%` }}
      />
      {/* Fertile segment (Green) */}
      {showFertileBlock && (
        <div
          className="absolute top-0 h-full bg-green-500 opacity-60 rounded-full"
          style={{ left: `${fertileLeft}%`, width: `${fertileWidth}%` }}
        />
      )}
    </div>
  );
}
