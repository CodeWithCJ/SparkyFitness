import React, { useEffect, useRef } from 'react';
import { Alert, View, Text, TouchableOpacity } from 'react-native';
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
import { useDeleteFoodEntryMeal } from '../hooks/useDeleteFoodEntryMeal';
import type { FoodEntry } from '../types/foodEntries';
import type { EntryNutrition } from '../utils/mealNutrition';
import {
  formatMobileCalories,
  formatMobileNumber,
  isMobileRtl,
  localizeServingUnit,
  mobileT,
} from '../localization';

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

  const isMealComponent = !!entry.food_entry_meal_id;

  const handleAnimationEnd = () => {
    invalidateCacheRef.current();
  };

  const onDeleteSuccess = () => {
    swipeableRef.current?.close();
    isRemoving.value = true;
    rowHeight.value = withTiming(0, { duration: ROW_COLLAPSE_DURATION }, (finished) => {
      if (finished) {
        runOnJS(handleAnimationEnd)();
      }
    });
  };

  const foodEntryDelete = useDeleteFoodEntry({
    entryId: entry.id,
    entryDate: entry.entry_date,
    onSuccess: onDeleteSuccess,
  });

  const mealDelete = useDeleteFoodEntryMeal({
    mealId: entry.food_entry_meal_id ?? '',
    entryDate: entry.entry_date,
    onSuccess: onDeleteSuccess,
  });

  const confirmAndDelete = isMealComponent ? mealDelete.confirmAndDelete : foodEntryDelete.confirmAndDelete;
  const deleteEntry = isMealComponent ? mealDelete.deleteEntry : foodEntryDelete.deleteEntry;

  // Keep the latest invalidateCache in a ref so the post-collapse animation
  // callback (`handleAnimationEnd`, run via runOnJS after the delete) always
  // invokes the current one. Written in an effect rather than during render so
  // the value stays mutable to React's compiler.
  useEffect(() => {
    invalidateCacheRef.current = isMealComponent ? mealDelete.invalidateCache : foodEntryDelete.invalidateCache;
  }, [isMealComponent, mealDelete.invalidateCache, foodEntryDelete.invalidateCache]);

  // Declared before useAnimatedStyle so the rowHeight mutation here is not seen
  // as modifying a value already consumed by a hook (a React compiler bailout).
  const handleLayout = (event: { nativeEvent: { layout: { height: number } } }) => {
    if (rowHeight.value === null) {
      rowHeight.value = event.nativeEvent.layout.height;
    }
  };

  const animatedStyle = useAnimatedStyle(() => {
    if (!isRemoving.value || rowHeight.value === null) {
      return {};
    }
    return {
      height: rowHeight.value,
      overflow: 'hidden' as const,
    };
  });

  const renderDeleteAction = () => (
    <TouchableOpacity
      className="bg-bg-danger justify-center items-center"
      style={{ width: DELETE_ACTION_WIDTH }}
      onPress={confirmAndDelete}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={mobileT('diary.deleteFood')}
    >
      <Text className="text-text-danger font-semibold text-sm">
        {mobileT('common.delete')}
      </Text>
    </TouchableOpacity>
  );

  const canQuickAdjust = !isMealComponent && !!onAdjustServing && Number(entry.serving_size) > 0;
  const name = entry.food_name || mobileT('diary.unknownFood');

  const handlePress = () => {
    if (isMealComponent && entry.food_entry_meal_id) {
      navigation.navigate('EditLoggedMeal', { foodEntryMealId: entry.food_entry_meal_id });
      return;
    }
    navigation.navigate('FoodEntryView', { entry });
  };

  const handleLongPress = () => {
    const buttons: {
      text: string;
      style?: 'cancel' | 'destructive';
      onPress?: () => void;
    }[] = [];
    if (canQuickAdjust) {
      buttons.push({
        text: mobileT('diary.adjustServing'),
        onPress: () => onAdjustServing!(entry),
      });
    }
    buttons.push({
      text: mobileT('common.delete'),
      style: 'destructive',
      onPress: deleteEntry,
    });
    buttons.push({ text: mobileT('common.cancel'), style: 'cancel' });
    Alert.alert(name, undefined, buttons);
  };

  return (
    <Animated.View style={animatedStyle} onLayout={handleLayout}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        renderLeftActions={isMobileRtl ? renderDeleteAction : undefined}
        renderRightActions={isMobileRtl ? undefined : renderDeleteAction}
        overshootLeft={false}
        overshootRight={false}
        leftThreshold={40}
        rightThreshold={40}
      >
        <View className="py-1.5 flex-row items-center bg-surface">
          <TouchableOpacity
            className="flex-1"
            style={{ marginEnd: 8 }}
            activeOpacity={0.7}
            onPress={handlePress}
            onLongPress={handleLongPress}
          >
            <View className="flex-row flex-wrap items-baseline">
              <Text className="text-md text-text-primary" numberOfLines={1}>
                {name}{' · '}
              </Text>
              <Text className="text-sm text-text-secondary" numberOfLines={1}>
                {formatMobileNumber(entry.quantity)}{' '}
                {localizeServingUnit(entry.unit)}
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
              {`${formatMobileCalories(nutrition.calories)} ▾`}
            </Button>
          ) : (
            <Text
              className="text-sm text-text-secondary font-medium"
              style={{ marginEnd: 8 }}
            >
              {formatMobileCalories(nutrition.calories)}
            </Text>
          )}
        </View>
      </ReanimatedSwipeable>
    </Animated.View>
  );
};

export default SwipeableFoodRow;
