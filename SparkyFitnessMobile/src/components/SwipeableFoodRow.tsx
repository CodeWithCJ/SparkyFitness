import React, { useRef } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Button from './ui/Button';
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
import type { EntryNutrition } from '../utils/mealNutrition';

interface SwipeableFoodRowProps {
  entry: FoodEntry;
  nutrition: EntryNutrition;
  onAdjustServing?: (entry: FoodEntry) => void;
}

const ROW_COLLAPSE_DURATION = 300;
const DELETE_ACTION_WIDTH = 80;

const SwipeableFoodRow: React.FC<SwipeableFoodRowProps> = ({ entry, nutrition, onAdjustServing }) => {
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

  const canQuickAdjust = !!onAdjustServing && entry.serving_size > 0 && !entry.food_entry_meal_id;
  const name = entry.food_name || 'Unknown food';

  return (
    <Animated.View style={animatedStyle} onLayout={handleLayout}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        overshootRight={false}
        rightThreshold={40}
      >
        <View className="py-1.5 flex-row items-center bg-surface">
          <TouchableOpacity
            className="flex-1 mr-2"
            activeOpacity={0.7}
            onPress={() => navigation.navigate('FoodEntryView', { entry })}
          >
            <View className="flex-row flex-wrap items-baseline">
              <Text className="text-md text-text-primary" numberOfLines={1}>
                {name}{' · '}
              </Text>
              <Text className="text-sm text-text-secondary" numberOfLines={1}>
                {entry.quantity} {entry.unit}
              </Text>
            </View>
          </TouchableOpacity>
          {canQuickAdjust ? (
            <Button
              variant="ghost"
              onPress={() => onAdjustServing!(entry)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              className="py-0 px-0"
              textClassName="text-sm text-text-secondary font-medium"
            >
              {`${nutrition.calories} Cal \u25BE`}
            </Button>
          ) : (
            <Text className="text-sm text-text-secondary font-medium mr-2">
              {nutrition.calories} Cal
            </Text>
          )}
        </View>
      </ReanimatedSwipeable>
    </Animated.View>
  );
};

export default SwipeableFoodRow;
