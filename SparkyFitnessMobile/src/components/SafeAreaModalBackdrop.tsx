import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Gap between the card and the usable edge (what `px-6` was). */
const CARD_MARGIN = 24;

interface SafeAreaModalBackdropProps {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
}

/**
 * The dim, tap-to-dismiss layer behind a centered prompt card. The layer fills
 * the window, but the card is padded by the safe-area insets: beside the Duo's
 * vertical bar the side inset is the strip, and a card centred in the whole
 * window runs under it. Insets are read live, never cached, because the strip
 * swaps edge between poses.
 */
export default function SafeAreaModalBackdrop({
  onPress,
  accessibilityLabel,
  children,
}: SafeAreaModalBackdropProps) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      className="flex-1 justify-center"
      style={{
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingLeft: CARD_MARGIN + insets.left,
        paddingRight: CARD_MARGIN + insets.right,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Pressable>
  );
}
