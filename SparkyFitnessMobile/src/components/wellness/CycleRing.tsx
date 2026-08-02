import React, { useEffect, useMemo } from 'react';
import { View, Text } from 'react-native';
import { Canvas, Circle as SkiaCircle, Path, Skia } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { useWellnessTokens } from './theme/wellnessTokens';
import { getPhaseColor } from '../../utils/cycleDisplayUtils';

interface CycleRingProps {
  cycleDay: number | null;
  cycleLength: number;
  periodLength: number;
  fertileStartDay?: number | null;
  fertileEndDay?: number | null;
  ovulationDay?: number | null;
  centerLabel: string;
  centerValue: string;
  centerSub?: string;
  size?: number;
  strokeWidth?: number;
}

const TRACK_COLOR = 'rgba(150, 150, 150, 0.15)';
// How far the day-marker dot pokes out past each edge of the ring stroke.
const MARKER_OVERHANG = 4;
const MARKER_STROKE_WIDTH = 1;
const MARKER_OUTLINE_COLOR = 'rgba(354, 0, 0, 0.8)';
const TICK_WIDTH = 3;
const TICK_OVERHANG = 1;

const CycleRing: React.FC<CycleRingProps> = ({
  cycleDay,
  cycleLength,
  periodLength,
  fertileStartDay,
  fertileEndDay,
  ovulationDay,
  centerLabel,
  centerValue,
  centerSub,
  size = 200,
  strokeWidth = 16,
}) => {
  const tokens = useWellnessTokens();
  const markerRadius = strokeWidth / 2 + MARKER_OVERHANG;
  // The canvas clips anything past its edge into a visible flat chord, so the
  // radius must leave room for the widest overhang (marker dot, ovulation
  // tick) plus 1 for edge antialiasing.
  const inset = Math.max(strokeWidth / 2 + TICK_OVERHANG, markerRadius) + 1;
  const radius = size / 2 - inset;
  const center = size / 2;
  const len = Math.max(cycleLength, periodLength + 1, 14);

  const oval = useMemo(
    () => ({ x: center - radius, y: center - radius, width: radius * 2, height: radius * 2 }),
    [center, radius],
  );

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, cycleDay, len]);

  // Period Path
  const periodPath = useDerivedValue(() => {
    const builder = Skia.PathBuilder.Make();
    const sweep = (periodLength / len) * 360 * progress.value;
    if (sweep > 0) {
      builder.addArc(oval, -90, sweep);
    }
    return builder.build();
  });

  // Fertile Path
  const fertilePath = useDerivedValue(() => {
    const builder = Skia.PathBuilder.Make();
    if (fertileStartDay && fertileEndDay) {
      const startAngle = -90 + ((fertileStartDay - 1) / len) * 360;
      const sweep = ((fertileEndDay - fertileStartDay + 1) / len) * 360 * progress.value;
      if (sweep > 0) {
        builder.addArc(oval, startAngle, sweep);
      }
    }
    return builder.build();
  });

  // Ovulation Tick: a radial notch crossing the ring at the ovulation day
  const ovulationPath = useMemo(() => {
    const builder = Skia.PathBuilder.Make();
    if (ovulationDay) {
      const angle = ((-90 + ((ovulationDay - 1) / len) * 360) * Math.PI) / 180;
      const rInner = radius - strokeWidth / 2 - TICK_OVERHANG;
      const rOuter = radius + strokeWidth / 2 + TICK_OVERHANG;
      builder.moveTo(center + rInner * Math.cos(angle), center + rInner * Math.sin(angle));
      builder.lineTo(center + rOuter * Math.cos(angle), center + rOuter * Math.sin(angle));
    }
    return builder.build();
  }, [ovulationDay, len, radius, strokeWidth, center]);

  // Marker Positions
  const markerX = useDerivedValue(() => {
    if (cycleDay === null) return -100;
    const dayVal = Math.min(cycleDay, len);
    const angle = ((dayVal - 1) / len) * 360 * progress.value - 90;
    const rad = (angle * Math.PI) / 180;
    return center + radius * Math.cos(rad);
  });

  const markerY = useDerivedValue(() => {
    if (cycleDay === null) return -100;
    const dayVal = Math.min(cycleDay, len);
    const angle = ((dayVal - 1) / len) * 360 * progress.value - 90;
    const rad = (angle * Math.PI) / 180;
    return center + radius * Math.sin(rad);
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Canvas style={{ width: size, height: size, position: 'absolute' }}>
        {/* Track */}
        <SkiaCircle
          cx={center}
          cy={center}
          r={radius}
          style="stroke"
          strokeWidth={strokeWidth}
          color={TRACK_COLOR}
        />
        {/* Period Arc */}
        <Path
          path={periodPath}
          style="stroke"
          strokeWidth={strokeWidth}
          color={getPhaseColor('menstrual', tokens)}
          strokeCap="round"
        />
        {/* Fertile Arc */}
        <Path
          path={fertilePath}
          style="stroke"
          strokeWidth={strokeWidth}
          color={getPhaseColor('fertile', tokens)}
          strokeCap="round"
        />
        {/* Ovulation Tick */}
        <Path
          path={ovulationPath}
          style="stroke"
          strokeWidth={TICK_WIDTH}
          color={getPhaseColor('ovulation', tokens)}
          opacity={progress}
        />
        {/* Day Marker */}
        {cycleDay !== null && (
          <>
            <SkiaCircle
              cx={markerX}
              cy={markerY}
              r={markerRadius}
              color="#FFFFFF"
              style="fill"
            />
            <SkiaCircle
              cx={markerX}
              cy={markerY}
              r={markerRadius - 1}
              style="stroke"
              strokeWidth={MARKER_STROKE_WIDTH}
              color={MARKER_OUTLINE_COLOR}
            />
          </>
        )}
      </Canvas>

      {/* Center Readout Overlay */}
      <View
        className="items-center justify-center"
        style={{ padding: size < 130 ? 2 : 16 }}
      >
        {!!centerLabel && (
          <Text className="text-text-secondary text-xs uppercase font-semibold tracking-wider text-center">
            {centerLabel}
          </Text>
        )}
        <Text
          className={`text-text-primary font-bold text-center ${
            size < 130 ? 'text-xs my-0.5' : 'text-3xl my-1'
          }`}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {centerValue}
        </Text>
        {!!centerSub && (
          <Text className="text-text-secondary text-xs text-center mt-0.5">
            {centerSub}
          </Text>
        )}
      </View>
    </View>
  );
};

export default CycleRing;
