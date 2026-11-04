import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import Icon, { type IconName } from './Icon';
import { ADD_MENU_ITEM_TINTS } from '../constants/addMenuItems';

export type AddMenuTint =
  (typeof ADD_MENU_ITEM_TINTS)[keyof typeof ADD_MENU_ITEM_TINTS];

/** The theme colour behind each tint, for the + sheet and its settings. */
export function useAddMenuTintColors(): Record<AddMenuTint, string> {
  const [accent, green, violet, red, amber, sky, pink] = useCSSVariable([
    '--color-accent-primary',
    '--color-cat-green',
    '--color-cat-violet',
    '--color-icon-danger',
    '--color-icon-warning',
    '--color-macro-fat',
    '--color-cat-pink',
  ]) as string[];
  return { accent, green, violet, red, amber, sky, pink };
}

/** An icon on a softly tinted rounded square. */
const AddMenuIconTile: React.FC<{
  icon: IconName;
  color: string;
  size: 'card' | 'row';
}> = ({ icon, color, size }) => {
  const box = size === 'card' ? 52 : 40;
  return (
    <View
      style={{
        width: box,
        height: box,
        borderRadius: size === 'card' ? 18 : 12,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: color, opacity: 0.14 },
        ]}
      />
      <Icon name={icon} size={size === 'card' ? 26 : 20} color={color} />
    </View>
  );
};

export default AddMenuIconTile;
