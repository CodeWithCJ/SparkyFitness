import React, { useCallback, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useCSSVariable } from 'uniwind';
import { clampPercent } from '../utils/mealDistribution';

const THUMB_SIZE = 24;
const TRACK_HEIGHT = 6;

interface PercentSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  accessibilityLabel: string;
  testID?: string;
}

/** Whole-number 0–100 slider; drag or tap the track to set a value. */
const PercentSlider: React.FC<PercentSliderProps> = ({
  value,
  onChange,
  disabled = false,
  accessibilityLabel,
  testID,
}) => {
  const [accent, track] = useCSSVariable([
    '--color-accent-primary',
    '--color-raised',
  ]) as [string, string];
  const [width, setWidth] = useState(0);
  const usable = Math.max(0, width - THUMB_SIZE);
  const thumbLeft = (clampPercent(value) / 100) * usable;

  const setFromX = useCallback(
    (x: number) => {
      if (usable <= 0) return;
      const next = clampPercent(((x - THUMB_SIZE / 2) / usable) * 100);
      if (next !== value) onChange(next);
    },
    [onChange, usable, value]
  );

  // Horizontal drags claim the gesture; vertical movement fails it so the
  // surrounding ScrollView keeps scrolling.
  const pan = Gesture.Pan()
    .enabled(!disabled)
    .runOnJS(true)
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onBegin((event) => setFromX(event.x))
    .onUpdate((event) => setFromX(event.x));
  const tap = Gesture.Tap()
    .enabled(!disabled)
    .runOnJS(true)
    .onEnd((event) => setFromX(event.x));

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <View
        testID={testID}
        onLayout={(event: LayoutChangeEvent) =>
          setWidth(event.nativeEvent.layout.width)
        }
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min: 0, max: 100, now: clampPercent(value) }}
        accessibilityState={{ disabled }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          if (disabled) return;
          const delta = event.nativeEvent.actionName === 'increment' ? 5 : -5;
          onChange(clampPercent(value + delta));
        }}
        style={{
          height: 40,
          justifyContent: 'center',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <View
          style={{
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            backgroundColor: track,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: THUMB_SIZE / 2,
            height: TRACK_HEIGHT,
            width: thumbLeft,
            borderRadius: TRACK_HEIGHT / 2,
            backgroundColor: accent,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: thumbLeft,
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            borderRadius: THUMB_SIZE / 2,
            backgroundColor: '#ffffff',
            borderWidth: 2,
            borderColor: accent,
          }}
        />
      </View>
    </GestureDetector>
  );
};

export default PercentSlider;
