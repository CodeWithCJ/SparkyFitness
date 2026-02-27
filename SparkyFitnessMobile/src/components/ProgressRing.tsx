import React, { useCallback } from 'react';
import { Canvas, Path, Circle as SkiaCircle, Skia } from '@shopify/react-native-skia';
import { useSharedValue, useDerivedValue, withTiming, Easing } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';

interface ProgressRingProps {
  progress: number; // 0-1 value (capped at 1 for display)
  size: number;
  strokeWidth: number;
  color: string;
  backgroundColor: string;
}

const ProgressRing: React.FC<ProgressRingProps> = ({
  progress,
  size,
  strokeWidth,
  color,
  backgroundColor,
}) => {
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const progressCapped = Math.min(Math.max(progress, 0), 1);

  const animatedProgress = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      animatedProgress.value = 0;
      animatedProgress.value = withTiming(progressCapped, {
        duration: 500,
        easing: Easing.out(Easing.cubic),
      });
    }, [progressCapped, animatedProgress])
  );

  const progressPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const sweepAngle = animatedProgress.value * 360;
    if (sweepAngle > 0) {
      const startAngle = -90; // Start from top
      const oval = {
        x: center - radius,
        y: center - radius,
        width: radius * 2,
        height: radius * 2,
      };
      path.addArc(oval, startAngle, sweepAngle);
    }
    return path;
  });

  return (
    <Canvas style={{ width: size, height: size }}>
      <SkiaCircle
        cx={center}
        cy={center}
        r={radius}
        style="stroke"
        strokeWidth={strokeWidth}
        color={backgroundColor}
      />
      <Path
        path={progressPath}
        style="stroke"
        strokeWidth={strokeWidth}
        color={color}
        strokeCap="round"
      />
    </Canvas>
  );
};

export default ProgressRing;
