import React, { useEffect, useRef } from 'react';
import { Alert, View, Text, Pressable, TouchableOpacity } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import type { ExerciseSessionResponse } from '@workspace/shared';
import Icon from './Icon';
import SafeImage from './SafeImage';
import {
  getWorkoutIcon,
  getSourceLabel,
  getWorkoutSummary,
  getFirstImage,
  buildSessionSubtitle,
} from '../utils/workoutSession';
import type { GetImageSource } from '../hooks/useExerciseImageSource';
import { useDeleteExerciseEntry, useDeleteWorkout } from '../hooks/useExerciseMutations';

interface SwipeableExerciseRowProps {
  session: ExerciseSessionResponse;
  entryDate: string;
  onPress?: () => void;
  getImageSource?: GetImageSource;
  weightUnit?: 'kg' | 'lbs';
  distanceUnit?: 'km' | 'miles';
}

const ROW_COLLAPSE_DURATION = 300;
const DELETE_ACTION_WIDTH = 80;

const SwipeableExerciseRow: React.FC<SwipeableExerciseRowProps> = ({
  session,
  entryDate,
  onPress,
  getImageSource,
  weightUnit = 'kg',
  distanceUnit = 'km',
}) => {
  const swipeableRef = useRef<SwipeableMethods | null>(null);
  const rowHeight = useSharedValue<number | null>(null);
  const isRemoving = useSharedValue(false);
  const invalidateCacheRef = useRef<() => void>(() => {});

  const [accentPrimary, textMuted, textSecondary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-text-secondary',
  ]) as [string, string, string];

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

  const workoutDelete = useDeleteWorkout({
    sessionId: session.type === 'preset' ? session.id : '',
    entryDate,
    onSuccess: onDeleteSuccess,
  });
  const exerciseDelete = useDeleteExerciseEntry({
    entryId: session.type === 'individual' ? session.id : '',
    entryDate,
    onSuccess: onDeleteSuccess,
  });

  const { confirmAndDelete, deleteEntry, invalidateCache } =
    session.type === 'preset' ? workoutDelete : exerciseDelete;

  // Keep the latest invalidateCache in a ref so the post-collapse animation
  // callback (`handleAnimationEnd`, run via runOnJS after the delete) always
  // invokes the current one. Written in an effect rather than during render so
  // the value stays mutable to React's compiler.
  useEffect(() => {
    invalidateCacheRef.current = invalidateCache;
  });

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

  const renderRightActions = () => (
    <TouchableOpacity
      className="bg-bg-danger justify-center items-center"
      style={{ width: DELETE_ACTION_WIDTH }}
      onPress={confirmAndDelete}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Delete exercise"
    >
      <Text className="text-text-danger font-semibold text-sm">Delete</Text>
    </TouchableOpacity>
  );

  const { name, duration, calories } = getWorkoutSummary(session);
  const { label: sourceLabel, isSparky } = getSourceLabel(session.source);
  const iconName = getWorkoutIcon(session);
  const firstImage = getFirstImage(session);
  const imageSource = firstImage && getImageSource ? getImageSource(firstImage) : null;
  const subtitle = buildSessionSubtitle(session, duration, calories, weightUnit, distanceUnit);

  const handleLongPress = () => {
    Alert.alert(name, undefined, [
      { text: 'Delete', style: 'destructive', onPress: deleteEntry },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Animated.View style={animatedStyle} onLayout={handleLayout}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        overshootRight={false}
        rightThreshold={40}
      >
        <Pressable className="py-2.5 bg-surface" onPress={onPress} onLongPress={handleLongPress}>
          <View className="flex-row items-center">
            <View className="mr-3 items-center justify-center" style={{ width: 36, height: 36 }}>
              <SafeImage
                source={imageSource}
                style={{ width: 36, height: 36, borderRadius: 8 }}
                fallback={<Icon name={iconName} size={20} color={accentPrimary} />}
              />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-semibold text-text-primary flex-1 mr-2" numberOfLines={1}>
                  {name}
                </Text>
                <View className="flex-row items-center gap-2">
                  <View
                    className="rounded-full px-1.5 py-0.5"
                    style={{ backgroundColor: isSparky ? `${accentPrimary}20` : `${textMuted}20` }}
                  >
                    <Text
                      className="text-[10px] font-medium"
                      style={{ color: isSparky ? accentPrimary : textSecondary }}
                    >
                      {sourceLabel}
                    </Text>
                  </View>
                  <Icon name="chevron-forward" size={14} color={textMuted} />
                </View>
              </View>
              <Text className="text-sm text-text-secondary mt-0.5" numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
          </View>
        </Pressable>
      </ReanimatedSwipeable>
    </Animated.View>
  );
};

export default SwipeableExerciseRow;
