import React from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StatusBar,
  View,
  Text,
  useWindowDimensions,
} from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon, { IconName } from './Icon';

export type AnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AnchoredMenuItem = {
  key: string;
  label: string;
  icon?: IconName;
  onPress: () => void;
};

/**
 * Measure a menu trigger for use as an AnchoredMenu anchor. Under Fabric,
 * `measureInWindow` invokes its callback synchronously; under Jest it never
 * fires, so fall back to a zero rect — the menu still opens and behaves, only
 * its position is meaningless (which tests don't assert).
 */
export function measureAnchoredMenuTrigger(
  node: {
    measureInWindow: (
      callback: (x: number, y: number, width: number, height: number) => void,
    ) => void;
  } | null,
  onAnchor: (anchor: AnchorRect) => void,
): void {
  let fired = false;
  node?.measureInWindow((x, y, width, height) => {
    fired = true;
    onAnchor({ x, y, width, height });
  });
  if (!fired) onAnchor({ x: 0, y: 0, width: 0, height: 0 });
}

type Props = {
  visible: boolean;
  anchor: AnchorRect | null;
  items: AnchoredMenuItem[];
  onClose: () => void;
  minWidth?: number;
};

// A lightweight popover-style menu anchored under a trigger, so the options
// appear right where the user tapped (rather than a bottom sheet far away).
const AnchoredMenu: React.FC<Props> = ({
  visible,
  anchor,
  items,
  onClose,
  minWidth = 200,
}) => {
  const { width: screenWidth } = useWindowDimensions();
  const accentColor = String(useCSSVariable('--color-accent-primary'));
  const textPrimary = String(useCSSVariable('--color-text-primary'));

  if (!visible || !anchor) return null;

  // Drop the menu just below the trigger and align its edge to the trigger's,
  // picking left- vs right-anchoring by which half of the screen the trigger is
  // in so the menu never runs off-screen.
  //
  // The anchor is measured in the app's content window, which (under Android
  // edge-to-edge) sits below the status bar, while this Modal overlay renders in
  // screen-absolute space. Add the status-bar height back so the menu lands
  // under the trigger instead of riding up and clipping it. iOS reports no
  // StatusBar.currentHeight, so it stays 0 there (already correct).
  const statusBarOffset =
    Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;
  const top = anchor.y + anchor.height + 6 + statusBarOffset;
  const isLeftHalf = anchor.x + anchor.width / 2 < screenWidth / 2;
  const menuStyle = isLeftHalf
    ? { top, left: Math.max(8, anchor.x), minWidth }
    : { top, right: Math.max(8, screenWidth - (anchor.x + anchor.width)), minWidth };

  return (
    <Modal
      visible={visible}
      transparent
      // No transition: a fade-out leaves the Modal mid-dismiss for ~300ms, and
      // iOS swallows a present that lands in that window — the cause of the
      // "tap opens, tap closes, next tap does nothing" every-other-tap bug (and
      // it also breaks handing off from this menu straight into another modal).
      animationType="none"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Dismiss menu">
        <View
          className="absolute bg-surface rounded-xl border border-border-subtle shadow-lg py-1"
          style={menuStyle}
        >
          {items.map((item, index) => (
            <Pressable
              key={item.key}
              onPress={() => {
                onClose();
                item.onPress();
              }}
              className={`flex-row items-center gap-3 px-4 py-3 ${
                index > 0 ? 'border-t border-border-subtle' : ''
              }`}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              {item.icon ? (
                <Icon name={item.icon} size={20} color={accentColor} />
              ) : null}
              <Text className="text-base font-medium" style={{ color: textPrimary }}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
};

export default AnchoredMenu;
