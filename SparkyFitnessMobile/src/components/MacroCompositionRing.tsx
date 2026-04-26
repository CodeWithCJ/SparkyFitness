import React, { useEffect, useMemo } from 'react';
import { Canvas, Circle as SkiaCircle, Path, Skia } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

interface MacroCompositionRingProps {
  size: number;
  strokeWidth: number;
  shares: { protein: number; carbs: number; fat: number };
  colors: { protein: string; carbs: string; fat: string };
  trackColor: string;
}

const MacroCompositionRing: React.FC<MacroCompositionRingProps> = ({
  size,
  strokeWidth,
  shares,
  colors,
  trackColor,
}) => {
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const oval = useMemo(
    () => ({ x: center - radius, y: center - radius, width: radius * 2, height: radius * 2 }),
    [center, radius],
  );

  const proteinShare = Math.max(0, Math.min(1, shares.protein));
  const carbsShare = Math.max(0, Math.min(1, shares.carbs));
  const fatShare = Math.max(0, Math.min(1, shares.fat));

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, proteinShare, carbsShare, fatShare]);

  const proteinPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const sweep = proteinShare * 360 * progress.value;
    if (sweep > 0) path.addArc(oval, -90, sweep);
    return path;
  });

  const carbsPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const start = -90 + proteinShare * 360 * progress.value;
    const sweep = carbsShare * 360 * progress.value;
    if (sweep > 0) path.addArc(oval, start, sweep);
    return path;
  });

  const fatPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const start = -90 + (proteinShare + carbsShare) * 360 * progress.value;
    const sweep = fatShare * 360 * progress.value;
    if (sweep > 0) path.addArc(oval, start, sweep);
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
        color={trackColor}
      />
      <Path
        path={proteinPath}
        style="stroke"
        strokeWidth={strokeWidth}
        color={colors.protein}
        strokeCap="butt"
      />
      <Path
        path={carbsPath}
        style="stroke"
        strokeWidth={strokeWidth}
        color={colors.carbs}
        strokeCap="butt"
      />
      <Path
        path={fatPath}
        style="stroke"
        strokeWidth={strokeWidth}
        color={colors.fat}
        strokeCap="butt"
      />
    </Canvas>
  );
};

export default MacroCompositionRing;
