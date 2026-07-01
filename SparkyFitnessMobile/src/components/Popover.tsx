import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Button from './ui/Button';
import type { AnchorRect } from './AnchoredMenu';

type Props = {
  visible: boolean;
  /**
   * Anchor rect in the coordinate space of the popover's parent. Render the
   * popover inside the same full-screen container the anchor was measured
   * against (e.g. a screen's root View, using the anchor's `onLayout` rect) so
   * the two share one coordinate space on both platforms.
   */
  anchor: AnchorRect | null;
  onDismiss: () => void;
  /** Optional bold heading rendered above the body. */
  title?: string;
  /** Body content. A plain string is styled for you; pass nodes for custom layout. */
  children: React.ReactNode;
  /** Label for the dismiss button (default "Got it"). */
  dismissLabel?: string;
  /**
   * Whether to render the dismiss button (default true). When false, the only
   * way to dismiss is tapping outside the card.
   */
  showDismissButton?: boolean;
  /** Horizontal screen margin the card keeps from each edge (default 16). */
  margin?: number;
};

const CARET_SIZE = 14;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

// A reusable informational popover anchored below a trigger, with a caret
// pointing up at the anchor and a "Got it" dismiss button. Tapping outside the
// card also dismisses. Unlike AnchoredMenu (a list of actions) this is for a
// single coaching message tied to an on-screen control.
//
// Rendered as an in-tree overlay rather than a Modal so it stays in the same
// coordinate space as its anchor — a RN Modal renders from the physical screen
// top, which lands too high when the host screen is presented as an iOS modal.
const Popover: React.FC<Props> = ({
  visible,
  anchor,
  onDismiss,
  title,
  children,
  dismissLabel = 'Got it',
  showDismissButton = true,
  margin = 16,
}) => {
  const { width: screenWidth } = useWindowDimensions();
  const surface = String(useCSSVariable('--color-surface'));
  const borderSubtle = String(useCSSVariable('--color-border-subtle'));

  if (!visible || !anchor) return null;

  const top = anchor.y + anchor.height + CARET_SIZE / 2 + 1;
  const cardWidth = screenWidth - margin * 2;
  const anchorCenterX = anchor.x + anchor.width / 2;
  // Caret position relative to the card's left edge, kept clear of the rounded
  // corners so it always reads as a pointer.
  const caretLeft = clamp(
    anchorCenterX - margin - CARET_SIZE / 2,
    16,
    cardWidth - 16 - CARET_SIZE,
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onDismiss}
        accessibilityLabel="Dismiss"
      />
      <Pressable
        className="absolute bg-surface rounded-2xl border border-border-subtle shadow-lg px-4 py-3.5"
        style={{ top, left: margin, right: margin }}
        // Absorb taps inside the card so only the button / outside dismisses.
        onPress={() => {}}
        accessible={false}
      >
        <View
          style={{
            position: 'absolute',
            top: -CARET_SIZE / 2,
            left: caretLeft,
            width: CARET_SIZE,
            height: CARET_SIZE,
            backgroundColor: surface,
            borderTopWidth: 1,
            borderLeftWidth: 1,
            borderColor: borderSubtle,
            transform: [{ rotate: '45deg' }],
          }}
        />
        {title ? (
          <Text className="text-text-primary text-base font-semibold mb-1">
            {title}
          </Text>
        ) : null}
        {typeof children === 'string' ? (
          <Text className="text-text-secondary text-sm leading-5">{children}</Text>
        ) : (
          children
        )}
        {showDismissButton ? (
          <View className="flex-row justify-end mt-2 -mr-2 -mb-1.5">
            <Button
              variant="ghost"
              onPress={onDismiss}
              className="py-1.5 px-2"
              textClassName="text-sm"
            >
              {dismissLabel}
            </Button>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
};

export default Popover;
