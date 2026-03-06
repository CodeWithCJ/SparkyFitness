import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';


interface CollapsibleSectionProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  itemCount: number;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  expanded,
  onToggle,
  children,
  itemCount,
}) => {
  const textSecondary = useCSSVariable('--color-text-secondary') as string;
  const rotation = useSharedValue(expanded ? 0 : -90);

  useEffect(() => {
    rotation.value = withTiming(expanded ? 0 : -90, { duration: 200 });
  }, [expanded, rotation]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle();
  };

  return (
    <View className="mt-2">
      <TouchableOpacity
        className="flex-row justify-between items-center py-3 border-b border-border-subtle"
        style={{ borderBottomWidth: StyleSheet.hairlineWidth }}
        onPress={handleToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityHint={expanded ? 'Collapse this section' : 'Expand this section'}
      >
        <View className="flex-row items-center gap-2">
          <Animated.View style={chevronStyle}>
            <Icon name="chevron-down" size={20} color={textSecondary} />
          </Animated.View>
          <Text className="text-base font-semibold text-text-primary">{title}</Text>
        </View>
        <Text className="text-sm text-text-muted">
          ({itemCount} {itemCount === 1 ? 'item' : 'items'})
        </Text>
      </TouchableOpacity>
      {expanded && <View className="mt-1">{children}</View>}
    </View>
  );
};

export default CollapsibleSection;
