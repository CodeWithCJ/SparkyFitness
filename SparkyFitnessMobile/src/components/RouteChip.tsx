import React from 'react';
import { Pressable, Text } from 'react-native';

interface RouteChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

/** A pill the person taps to pick one choice or switch one on. */
const RouteChip: React.FC<RouteChipProps> = ({ label, selected, onPress }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected }}
    className={`px-3 py-2 rounded-full border ${
      selected
        ? 'bg-accent-primary border-accent-primary'
        : 'border-border-subtle'
    }`}
  >
    <Text
      className={`text-sm font-semibold ${
        selected ? 'text-white' : 'text-text-primary'
      }`}
    >
      {label}
    </Text>
  </Pressable>
);

export default RouteChip;
