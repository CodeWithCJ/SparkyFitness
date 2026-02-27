import React, { useRef } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useDeleteFoodEntry } from '../hooks/useDeleteFoodEntry';
import type { FoodEntry } from '../types/foodEntries';
import type { EntryNutrition } from './FoodSummary';

interface SwipeableFoodRowProps {
  entry: FoodEntry;
  nutrition: EntryNutrition;
}

const ROW_COLLAPSE_DURATION = 300;
const DELETE_ACTION_WIDTH = 80;

const SwipeableFoodRow: React.FC<SwipeableFoodRowProps> = ({ entry, nutrition }) => {
  const navigation = useNavigation();
  const swipeableRef = useRef<any>(null);
  const rowHeight = useSharedValue<number | null>(null);
  const isRemoving = useSharedValue(false);
  const invalidateCacheRef = useRef<() => void>(() => {});

  const handleAnimationEnd = () => {
    invalidateCacheRef.current();
  };

  const { confirmAndDelete, invalidateCache } = useDeleteFoodEntry({
    entryId: entry.id,
    entryDate: entry.entry_date,
    onSuccess: () => {
      swipeableRef.current?.close();
      isRemoving.value = true;
      rowHeight.value = withTiming(0, { duration: ROW_COLLAPSE_DURATION }, (finished) => {
        if (finished) {
          runOnJS(handleAnimationEnd)();
        }
      });
    },
  });

  invalidateCacheRef.current = invalidateCache;

  const animatedStyle = useAnimatedStyle(() => {
    if (!isRemoving.value || rowHeight.value === null) {
      return {};
    }
    return {
      height: rowHeight.value,
      overflow: 'hidden' as const,
    };
  });

  const handleLayout = (event: { nativeEvent: { layout: { height: number } } }) => {
    if (rowHeight.value === null) {
      rowHeight.value = event.nativeEvent.layout.height;
    }
  };

  const renderRightActions = () => (
    <TouchableOpacity
      className="bg-bg-danger justify-center items-center"
      style={{ width: DELETE_ACTION_WIDTH }}
      onPress={confirmAndDelete}
      activeOpacity={0.7}
    >
      <Text className="text-text-danger font-semibold text-sm">Delete</Text>
    </TouchableOpacity>
  );

  const name = entry.food_name || 'Unknown food';

  return (
    <Animated.View style={animatedStyle} onLayout={handleLayout}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        overshootRight={false}
        rightThreshold={40}
      >
        <TouchableOpacity
          className="py-2 flex-row justify-between items-center bg-surface"
          activeOpacity={0.7}
          onPress={() => navigation.navigate('FoodEntryView', { entry })}
        >
          <Text className="text-md text-text-primary flex-1 mr-2" numberOfLines={1}>
            {name}
            <Text className="text-sm text-text-secondary">
              {' \u00B7 '}{entry.quantity} {entry.unit}
            </Text>
          </Text>
          <Text className="text-sm text-text-secondary font-medium mr-2">
            {nutrition.calories} Cal
          </Text>
        </TouchableOpacity>
      </ReanimatedSwipeable>
    </Animated.View>
  );
};

export default SwipeableFoodRow;
