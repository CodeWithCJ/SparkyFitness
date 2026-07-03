import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, Path, Circle as SkiaCircle, Skia } from '@shopify/react-native-skia';
import { useSharedValue, useDerivedValue, withTiming, Easing } from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';

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

  // Replay the 0 -> current entrance animation each time the screen regains
  // focus, then smoothly follow later progress changes (e.g. a per-second timer
  // tick) without resetting to zero. Both writes to `animatedProgress` live in
  // a single effect (React's compiler can't optimize a shared value mutated
  // across two effects); `wasFocused` distinguishes a fresh focus — which resets
  // to zero first — from an in-place value change.
  const isFocused = useIsFocused();
  const wasFocused = useRef(false);
  useEffect(() => {
    // Skip animating while blurred so a mounted-but-hidden ring (e.g. the
    // fasting/calorie ring on the Dashboard while another screen is on top)
    // doesn't schedule frames for a per-second progress tick no one can see.
    if (!isFocused) {
      wasFocused.current = false;
      return;
    }
    const justFocused = !wasFocused.current;
    wasFocused.current = true;
    if (justFocused) {
      animatedProgress.value = 0;
    }
    animatedProgress.value = withTiming(progressCapped, {
      duration: 500,
      easing: Easing.out(Easing.cubic),
    });
  }, [isFocused, progressCapped, animatedProgress]);

  const oval = useMemo(() => ({
    x: center - radius,
    y: center - radius,
    width: radius * 2,
    height: radius * 2,
  }), [center, radius]);

  const progressPath = useDerivedValue(() => {
    const builder = Skia.PathBuilder.Make();
    const sweepAngle = animatedProgress.value * 360;
    if (sweepAngle > 0) {
      builder.addArc(oval, -90, sweepAngle);
    }
    return builder.build();
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
