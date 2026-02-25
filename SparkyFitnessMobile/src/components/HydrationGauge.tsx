import React, { useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Canvas, Group, Path, Rect, Skia } from '@shopify/react-native-skia';
import { useSharedValue, useDerivedValue, withTiming, Easing } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';

interface HydrationGaugeProps {
  consumed: number; // ml
  goal: number;     // ml
  unit?: string;
  onIncrement?: () => void;
  onDecrement?: () => void;
  disableDecrement?: boolean;
}

const UNIT_LABELS: Record<string, string> = {
  ml: 'ml',
  oz: 'oz',
  liter: 'L',
};

function convertFromMl(ml: number, unit: string): number {
  switch (unit) {
    case 'oz': return ml / 29.5735;
    case 'liter': return ml / 1000;
    default: return ml;
  }
}

const CANVAS_WIDTH = 70;
const CANVAS_HEIGHT = 130;

// Fillable region (bottom of lip to bottom of bottle)
const FILL_TOP = 28;
const FILL_BOTTOM = 124;
const FILL_HEIGHT = FILL_BOTTOM - FILL_TOP;

const HydrationGauge: React.FC<HydrationGaugeProps> = ({ consumed, goal, unit = 'ml', onIncrement, onDecrement, disableDecrement }) => {
  const hydrationColor = useCSSVariable('--color-hydration') as string;
  const trackColor = useCSSVariable('--color-progress-track') as string;
  const outlineColor = useCSSVariable('--color-border-strong') as string;

  const progress = goal > 0 ? Math.min(consumed / goal, 1) : 0;

  const animatedProgress = useSharedValue(0);

  useEffect(() => {
    animatedProgress.value = withTiming(progress, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, animatedProgress]);

  const bottlePath = useMemo(() => {
    const p = Skia.Path.Make();

    // Neck
    p.moveTo(26, 6);
    p.lineTo(26, 23);

    // Lip (cap ridge)
    p.lineTo(23, 23);
    p.lineTo(23, 28);

    // Left shoulder curve
    p.cubicTo(23, 34, 12, 37, 12, 42);

    // Left body
    p.lineTo(12, 112);

    // Bottom curves
    p.cubicTo(12, 121, 20, 124, 35, 124);
    p.cubicTo(50, 124, 58, 121, 58, 112);

    // Right body
    p.lineTo(58, 42);

    // Right shoulder curve
    p.cubicTo(58, 37, 47, 34, 47, 28);

    // Lip right
    p.lineTo(47, 23);
    p.lineTo(44, 23);

    // Right neck
    p.lineTo(44, 6);

    p.close();
    return p;
  }, []);

  const fillPath = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const y = FILL_BOTTOM - FILL_HEIGHT * animatedProgress.value;
    p.addRect(Skia.XYWHRect(0, y, CANVAS_WIDTH, CANVAS_HEIGHT - y));
    return p;
  });

  const convertedConsumed = convertFromMl(consumed, unit);
  const convertedGoal = convertFromMl(goal, unit);
  const useDecimals = unit === 'liter' || unit === 'oz';
  const displayConsumed = useDecimals ? parseFloat(convertedConsumed.toFixed(1)) : Math.round(convertedConsumed);
  const displayGoal = useDecimals ? parseFloat(convertedGoal.toFixed(1)) : Math.round(convertedGoal);
  const unitLabel = UNIT_LABELS[unit] ?? unit;

  const showButtons = !!onIncrement || !!onDecrement;

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      {/* <Text className="text-md font-bold text-text-primary mb-3">Water</Text> */}
      <View className="flex-row items-center">
        <View className="flex-row items-center mr-4">
          {showButtons && (
            <TouchableOpacity
              onPress={onDecrement}
              disabled={disableDecrement}
              style={disableDecrement ? { opacity: 0.3 } : undefined}
              className="p-2"
            >
              <Icon name="remove-circle" size={28} color={hydrationColor} />
            </TouchableOpacity>
          )}
          <Canvas style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
            {/* Fill clipped to bottle shape */}
            <Group clip={bottlePath}>
              <Rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} color={trackColor} />
              <Path path={fillPath} color={hydrationColor} />
            </Group>
            {/* Bottle outline */}
            <Path path={bottlePath} style="stroke" strokeWidth={2} color={outlineColor} />
          </Canvas>
          {showButtons && (
            <TouchableOpacity onPress={onIncrement} className="p-2">
              <Icon name="add-circle" size={28} color={hydrationColor} />
            </TouchableOpacity>
          )}
        </View>
        <View className="flex-1 items-center mr-2">
          <Text className="text-2xl font-bold text-text-primary">
            {displayConsumed.toLocaleString()} {unitLabel}
          </Text>
          <Text className="text-sm text-text-secondary mt-0.5">
            of {displayGoal.toLocaleString()} {unitLabel}
          </Text>
        </View>
      </View>
    </View>
  );
};

export default HydrationGauge;
