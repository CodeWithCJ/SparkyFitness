import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { WorkoutReorderContent } from '../components/WorkoutReorderList';
import {
  getWorkoutReorderSource,
  setWorkoutReorderSource,
} from '../services/workoutReorderSource';
import { moveCardExerciseItem } from '../utils/workoutSupersets';
import type { WorkoutCardExercise } from '../utils/workoutSession';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'WorkoutReorder'>;

/**
 * Reorder exercises: the live workout's, or the list of the workout form that opened it (see `workoutReorderSource`). Presented as a native modal, the same
 * way the Add exercise picker is, so the system owns the sheet's width (narrow
 * on both unfolded Duo poses) and its header, whose Done button is a native
 * checkmark bar button that the Duo's status strip can never cover.
 */
function WorkoutReorderScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { getImageSource } = useExerciseImageSource();
  const storeExercises = useActiveWorkoutStore((s) => s.session?.exercises);
  // Opened from a form list: it owns the exercises, so keep a local copy that
  // follows each move and forward the move to the owner. Otherwise the live
  // workout's store is the source.
  const [source] = useState(getWorkoutReorderSource);
  const [localExercises, setLocalExercises] = useState<
    WorkoutCardExercise[] | undefined
  >(source?.exercises);
  const exercises = source != null ? localExercises : storeExercises;
  useEffect(() => () => setWorkoutReorderSource(null), []);

  const handleDone = useCallback(() => navigation.goBack(), [navigation]);
  const handleMove = useCallback(
    (from: number, to: number) => {
      if (source != null) {
        setLocalExercises((prev) =>
          prev ? moveCardExerciseItem(prev, from, to) : prev
        );
        source.onMove(from, to);
        return;
      }
      useActiveWorkoutStore.getState().reorderExercises(from, to);
    },
    [source]
  );

  const header = useScreenHeader({
    title: t('workoutReorder.title', { defaultValue: 'Reorder exercises' }),
    right: {
      kind: 'icon',
      sfSymbol: 'checkmark',
      ionicon: 'checkmark',
      role: 'primary',
      accessibilityLabel: t('workoutReorder.doneHint', {
        defaultValue: 'Done reordering',
      }),
      identifier: 'workout-reorder-done',
      onPress: handleDone,
    },
  });

  return (
    <GestureHandlerRootView
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <View className="flex-1">
        <WorkoutReorderContent
          exercises={exercises ?? []}
          getImageSource={getImageSource}
          onMoveItem={handleMove}
        />
      </View>
    </GestureHandlerRootView>
  );
}

export default WorkoutReorderScreen;
