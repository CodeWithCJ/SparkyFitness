import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Animated,
} from 'react-native';
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
  const rotateAnim = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: expanded ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [expanded, rotateAnim]);

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle();
  };

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-90deg', '0deg'],
  });

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
          <Animated.View style={{ transform: [{ rotate: rotateInterpolate }] }}>
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
