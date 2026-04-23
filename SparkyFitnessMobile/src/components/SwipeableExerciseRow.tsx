import React, { useRef } from 'react';
import { View, Text, Pressable, TouchableOpacity } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
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
  const swipeableRef = useRef<any>(null);
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

  const { confirmAndDelete, invalidateCache } =
    session.type === 'preset' ? workoutDelete : exerciseDelete;

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

  const { name, duration, calories } = getWorkoutSummary(session);
  const { label: sourceLabel, isSparky } = getSourceLabel(session.source);
  const iconName = getWorkoutIcon(session);
  const firstImage = getFirstImage(session);
  const imageSource = firstImage && getImageSource ? getImageSource(firstImage) : null;
  const subtitle = buildSessionSubtitle(session, duration, calories, weightUnit, distanceUnit);

  return (
    <Animated.View style={animatedStyle} onLayout={handleLayout}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        overshootRight={false}
        rightThreshold={40}
      >
        <Pressable className="py-2.5 bg-surface" onPress={onPress}>
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
