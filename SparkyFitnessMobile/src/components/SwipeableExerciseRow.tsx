import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View, Text, Pressable } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import { DeleteRowAction } from './SwipeableDeleteRow';
import { useRowCollapse } from '../hooks/useRowCollapse';
import type { ExerciseSessionResponse } from '@workspace/shared';
import { canEditGroupedWorkout } from '@workspace/shared';
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

const SwipeableExerciseRow: React.FC<SwipeableExerciseRowProps> = ({
  session,
  entryDate,
  onPress,
  getImageSource,
  weightUnit = 'kg',
  distanceUnit = 'km',
}) => {
  const { t } = useTranslation();
  const swipeableRef = useRef<SwipeableMethods | null>(null);
  const invalidateCacheRef = useRef<() => void>(() => {});
  const { collapse, handleLayout, animatedStyle } = useRowCollapse(() =>
    invalidateCacheRef.current(),
  );

  const [accentPrimary, textMuted, textSecondary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-text-secondary',
  ]) as [string, string, string];

  const onDeleteSuccess = () => {
    swipeableRef.current?.close();
    collapse();
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

  // Keep the latest invalidateCache in a ref so the post-collapse callback
  // (run via runOnJS after the delete) always invokes the current one. Written
  // in an effect rather than during render so the value stays mutable to
  // React's compiler.
  useEffect(() => {
    invalidateCacheRef.current = invalidateCache;
  }, [invalidateCache]);

  const renderRightActions = () => (
    <DeleteRowAction onPress={confirmAndDelete} accessibilityLabel={t('exerciseRow.deleteExercise', { defaultValue: 'Delete exercise' })} />
  );

  const { name, duration, calories } = getWorkoutSummary(session, t);
  const sourceLabel = getSourceLabel(session.source);
  const canEdit = canEditGroupedWorkout(session.source);
  const iconName = getWorkoutIcon(session);
  const firstImage = getFirstImage(session);
  const imageSource = firstImage && getImageSource ? getImageSource(firstImage) : null;
  const subtitle = buildSessionSubtitle(session, duration, calories, t, weightUnit, distanceUnit);

  const handleLongPress = () => {
    Alert.alert(name, undefined, [
      { text: t('common.delete', { defaultValue: 'Delete' }), style: 'destructive', onPress: deleteEntry },
      { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
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
            {/* Kept in step with the food row's thumbnail so the two diary
                row types line up rather than differing by a few pixels. */}
            <View className="mr-3 items-center justify-center" style={{ width: 56, height: 56 }}>
              <SafeImage
                source={imageSource}
                style={{ width: 56, height: 56, borderRadius: 8 }}
                fallback={<Icon name={iconName} size={28} color={accentPrimary} />}
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
                    style={{ backgroundColor: canEdit ? `${accentPrimary}20` : `${textMuted}20` }}
                  >
                    <Text
                      className="text-xs font-medium"
                      style={{ color: canEdit ? accentPrimary : textSecondary }}
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
