import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Spacing kept between the content and the screen's top and bottom edges. */
const EDGE_PADDING = 16;

interface FullScreenModalBodyProps {
  children: React.ReactNode;
  /** Layout for the content, e.g. `justify-between px-6`. */
  className?: string;
}

/**
 * Body of a full-screen `Modal`, clear of the status and navigation bars.
 *
 * Under Android edge-to-edge a full-screen Modal is drawn beneath both system
 * bars, so its content has to read the insets itself. `SafeAreaView` from
 * `react-native` does not do it: it only applies insets on iOS, and renders
 * as a plain View on Android, which is how a header ended up under the clock
 * and a primary button under the back / home / recents controls.
 *
 * The header gets its spacing on top of the status bar, since nothing else
 * separates it from the clock. The bottom follows `FooterActionBar`'s rule,
 * `Math.max(insets.bottom, 16)`, so an action at the bottom sits where the
 * app's other bottom actions do.
 */
const FullScreenModalBody: React.FC<FullScreenModalBodyProps> = ({
  children,
  className = '',
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      className={`flex-1 bg-background ${className}`}
      style={{
        paddingTop: insets.top + EDGE_PADDING,
        paddingBottom: Math.max(insets.bottom, EDGE_PADDING),
      }}
    >
      {children}
    </View>
  );
};

export default FullScreenModalBody;
