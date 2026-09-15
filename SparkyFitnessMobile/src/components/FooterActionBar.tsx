import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Padding kept below the action when the platform reports no bottom inset. */
const MIN_BOTTOM_PADDING = 16;

interface FooterActionBarProps {
  children: React.ReactNode;
}

/**
 * Sticky bottom action for list screens, clear of the system navigation bar.
 *
 * The inset is the whole point. A screen whose action sits inside its list
 * inherits that list's `contentContainerStyle` padding, but one pinned as a
 * sibling of the list does not, and a flat padding leaves it under Android's
 * navigation bar -- around 48 px tall with the 3-button layout, against the
 * 16 px these screens used to reserve.
 *
 * Deliberately separate from `FooterSaveBar`, which carries a top divider, its
 * own spacing and the duplicate-press guard a save needs. This is the plain
 * variant for an action that only navigates; sharing the inset rule is what
 * keeps a third screen from rediscovering the same bug.
 */
const FooterActionBar: React.FC<FooterActionBarProps> = ({ children }) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="px-4 bg-background"
      style={{ paddingBottom: Math.max(insets.bottom, MIN_BOTTOM_PADDING) }}
    >
      {children}
    </View>
  );
};

export default FooterActionBar;
