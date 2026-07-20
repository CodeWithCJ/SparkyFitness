import React, { useEffect, useMemo } from 'react';
import { View, Text } from 'react-native';
import { Canvas, Circle as SkiaCircle, Path, Skia } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { useWellnessTokens } from './theme/wellnessTokens';

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
  const radius = (size - strokeWidth) / 2;
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

  // Ovulation Path (draw as a small arc or tick)
  const ovulationPath = useDerivedValue(() => {
    const builder = Skia.PathBuilder.Make();
    if (ovulationDay) {
      const startAngle = -90 + ((ovulationDay - 1) / len) * 360;
      // Small 2 degree sweep to render as a distinct indicator line
      const sweep = 2 * progress.value;
      builder.addArc(oval, startAngle, sweep);
    }
    return builder.build();
  });

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
          color={tokens.phaseMenstrual}
          strokeCap="round"
        />
        {/* Fertile Arc */}
        <Path
          path={fertilePath}
          style="stroke"
          strokeWidth={strokeWidth}
          color={tokens.phaseFollicular}
          strokeCap="round"
        />
        {/* Ovulation Tick */}
        <Path
          path={ovulationPath}
          style="stroke"
          strokeWidth={strokeWidth + 4}
          color={tokens.phaseOvulation}
          strokeCap="round"
        />
        {/* Day Marker */}
        {cycleDay !== null && (
          <SkiaCircle
            cx={markerX}
            cy={markerY}
            r={8}
            color="#FFFFFF"
            style="fill"
          />
        )}
      </Canvas>

      {/* Center Readout Overlay */}
      <View className="items-center justify-center p-4">
        <Text className="text-text-secondary text-xs uppercase font-semibold tracking-wider text-center">
          {centerLabel}
        </Text>
        <Text className="text-text-primary text-3xl font-bold my-1 text-center">
          {centerValue}
        </Text>
        {centerSub ? (
          <Text className="text-text-secondary text-xs text-center mt-1">
            {centerSub}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

export default CycleRing;
