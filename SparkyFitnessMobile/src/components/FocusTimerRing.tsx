import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface FocusTimerRingProps {
  size: number;
  strokeWidth: number;
  /** Fraction of the ring drawn in `color`, 0..1, from 12 o'clock clockwise. */
  progress: number;
  color: string;
  trackColor: string;
  children?: React.ReactNode;
}

/**
 * The rest card's and the hold screen's round timer: a track circle with the
 * remaining fraction drawn over it, content centered inside. Purely
 * presentational; the caller re-renders it on the shared clock tick.
 */
function FocusTimerRing({
  size,
  strokeWidth,
  progress,
  color,
  trackColor,
  children,
}: FocusTimerRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <View
      className="items-center justify-center"
      style={{ width: size, height: size }}
    >
      <Svg
        width={size}
        height={size}
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
        pointerEvents="none"
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {clamped > 0 && (
          <Circle
            testID="focus-timer-ring-arc"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circumference * clamped} ${circumference}`}
            fill="none"
          />
        )}
      </Svg>
      {children}
    </View>
  );
}

export default React.memo(FocusTimerRing);
