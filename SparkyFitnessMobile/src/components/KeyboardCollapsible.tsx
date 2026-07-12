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
 * (a shared value) then drives the collapse on the UI thread. On Android the
 * animated clip re-lays the measured View out at partial heights while the
 * collapse runs, so layout events are only trusted while the keyboard is
 * closed (`keyboardProgress` at 0).
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
    <Animated.View testID="keyboard-collapsible-clip" style={collapseStyle}>
      <View
        testID="keyboard-collapsible-content"
        onLayout={(e) => {
          // On Android the animated clip re-lays this view out at partial
          // heights mid-animation, so only a keyboard-closed measurement
          // reflects the child's natural height. Accepting a partial value
          // would ratchet the restored height down on every keyboard cycle.
          if (keyboardProgress.value > 0) {
            return;
          }
          const h = e.nativeEvent.layout.height;
          setHeight((prev) => (h > 0 && h !== prev ? h : prev));
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}
