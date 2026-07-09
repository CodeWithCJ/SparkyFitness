import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

/**
 * Collapses its children to zero height (fading as it goes) while the keyboard
 * is up, tied to the keyboard's own animation curve, and restores them on
 * dismiss. Hands vertical space back to a scrollable log exactly when the user
 * is typing — used on the active workout screen for the exercise rail and the
 * header's progress row.
 *
 * The child's natural height is measured on first layout; `keyboardProgress`
 * (a shared value) then drives the collapse on the UI thread. The measured View
 * keeps its content height throughout (RN children default to `flexShrink: 0`),
 * so the clip is purely visual and the measurement never oscillates.
 */
export default function KeyboardCollapsible({ children }: { children: ReactNode }) {
  const { progress: keyboardProgress } = useReanimatedKeyboardAnimation();
  const [height, setHeight] = useState(0);

  const collapseStyle = useAnimatedStyle(() => {
    const p = keyboardProgress.value;
    return {
      // Auto height until first layout measures the child, then collapse to 0.
      height:
        height === 0 ? undefined : interpolate(p, [0, 1], [height, 0], Extrapolation.CLAMP),
      opacity: interpolate(p, [0, 1], [1, 0], Extrapolation.CLAMP),
      overflow: 'hidden',
    };
  });

  return (
    <Animated.View style={collapseStyle}>
      <View
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          setHeight((prev) => (h > 0 && h !== prev ? h : prev));
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}
