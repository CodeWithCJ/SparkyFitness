import { useMemo } from 'react';

interface CycleRingProps {
  cycleDay: number | null;
  cycleLength: number;
  periodLength: number;
  /** Cycle-day offsets (1-based) for fertile window + ovulation, if available. */
  fertileStartDay?: number | null;
  fertileEndDay?: number | null;
  ovulationDay?: number | null;
  centerLabel: string;
  centerValue: string;
  centerSub?: string;
}

const R = 84;
const CX = 100;
const CY = 100;
const STROKE = 16;

function polar(day: number, cycleLength: number) {
  // Day 1 at top (-90deg), clockwise.
  const angle = ((day - 1) / cycleLength) * 360 - 90;
  const rad = (angle * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
}

function arcPath(fromDay: number, toDay: number, cycleLength: number) {
  const start = polar(fromDay, cycleLength);
  const end = polar(toDay + 1, cycleLength);
  const large = (toDay + 1 - fromDay) / cycleLength > 0.5 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${R} ${R} 0 ${large} 1 ${end.x} ${end.y}`;
}

export default function CycleRing({
  cycleDay,
  cycleLength,
  periodLength,
  fertileStartDay,
  fertileEndDay,
  ovulationDay,
  centerLabel,
  centerValue,
  centerSub,
}: CycleRingProps) {
  const len = Math.max(cycleLength, periodLength + 1, 14);
  const marker = useMemo(
    () => (cycleDay ? polar(Math.min(cycleDay, len), len) : null),
    [cycleDay, len]
  );

  return (
    <svg
      viewBox="0 0 200 200"
      className="w-full max-w-[280px] mx-auto"
      role="img"
      aria-label={`${centerLabel} ${centerValue}${centerSub ? ', ' + centerSub : ''}`}
    >
      {/* Track */}
      <circle
        cx={CX}
        cy={CY}
        r={R}
        fill="none"
        stroke="currentColor"
        className="text-muted/30"
        strokeWidth={STROKE}
      />
      {/* Period arc */}
      <path
        d={arcPath(1, periodLength, len)}
        fill="none"
        stroke="#C9524E"
        strokeWidth={STROKE}
        strokeLinecap="round"
        className="cycle-ring-arc"
      />
      {/* Fertile arc */}
      {fertileStartDay && fertileEndDay ? (
        <path
          d={arcPath(fertileStartDay, fertileEndDay, len)}
          fill="none"
          stroke="#A9D3B5"
          strokeWidth={STROKE}
          strokeLinecap="round"
          className="cycle-ring-arc"
        />
      ) : null}
      {/* Ovulation tick */}
      {ovulationDay ? (
        <path
          d={arcPath(ovulationDay, ovulationDay, len)}
          fill="none"
          stroke="#33684A"
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
      ) : null}
      {/* Current-day marker */}
      {marker ? (
        <circle
          cx={marker.x}
          cy={marker.y}
          r={7}
          fill="#3d3d3d"
          stroke="#fff"
          strokeWidth={3}
        />
      ) : null}
      {/* Center readout */}
      <text
        x={CX}
        y={CY - 18}
        textAnchor="middle"
        className="fill-muted-foreground"
        fontSize="10"
        letterSpacing="1.5"
      >
        {centerLabel.toUpperCase()}
      </text>
      <text
        x={CX}
        y={CY + 12}
        textAnchor="middle"
        className="fill-foreground"
        fontSize="36"
        fontWeight="700"
      >
        {centerValue}
      </text>
      {centerSub ? (
        <text
          x={CX}
          y={CY + 32}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize="10"
        >
          {centerSub}
        </text>
      ) : null}
    </svg>
  );
}
