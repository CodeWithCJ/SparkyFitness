import React from 'react';
import {
  Modal,
  Pressable,
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
  const top = anchor.y + anchor.height + 6;
  const isLeftHalf = anchor.x + anchor.width / 2 < screenWidth / 2;
  const menuStyle = isLeftHalf
    ? { top, left: Math.max(8, anchor.x), minWidth }
    : { top, right: Math.max(8, screenWidth - (anchor.x + anchor.width)), minWidth };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
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
