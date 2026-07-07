import React, { useCallback, useMemo, useState } from 'react';
import { Alert, View, Text, ScrollView } from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import ActiveWorkoutExerciseCard, {
  METRIC_MENU_LABELS,
  METRIC_OPTIONS,
} from '../components/ActiveWorkoutExerciseCard';
import AnchoredMenu, { type AnchorRect } from '../components/AnchoredMenu';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { clearDraft, loadActiveDraft } from '../services/workoutDraftService';
import {
  useDeleteWorkoutPreset,
  usePreferences,
  useProfile,
  useServerConnection,
} from '../hooks';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useStartLiveWorkout } from '../hooks/useStartLiveWorkout';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  buildPresetStartExercisesPayload,
  buildSupersetColorMap,
  getSupersetRuns,
  presetExerciseToCardExercise,
  SUPERSET_PALETTE_VARS,
} from '../utils/workoutSession';
import type { SupersetBorder } from '../components/ActiveWorkoutRail';
import type { RootStackScreenProps } from '../types/navigation';

type WorkoutPresetDetailScreenProps = RootStackScreenProps<'WorkoutPresetDetail'>;

const WorkoutPresetDetailScreen: React.FC<WorkoutPresetDetailScreenProps> = ({
  navigation,
  route,
}) => {
  const preset = route.params.updatedPreset ?? route.params.preset;
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const { preferences } = usePreferences();
  const { profile } = useProfile();
  const { isConnected } = useServerConnection();
  // Workout screens only know how to display kg or lbs. Coerce st_lbs to lbs so
  // we never quietly hand an unsupported unit to weightFromKg.
  const weightUnit: 'kg' | 'lbs' =
    preferences?.default_weight_unit === 'kg' ? 'kg' : 'lbs';
  const exerciseCount = preset.exercises?.length ?? 0;

  const { getImageSource } = useExerciseImageSource();
  const cardExercises = useMemo(
    () => (preset.exercises ?? []).map(presetExerciseToCardExercise),
    [preset.exercises],
  );

  // Preset templates read best fully laid out (the old static table showed
  // every set): cards default expanded, collapsing allowed.
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});
  const toggleExpanded = useCallback((entryId: string) => {
    setCollapsedIds(prev => ({ ...prev, [entryId]: !prev[entryId] }));
  }, []);

  // Metric column is shared with the workout screens (intended).
  const metricColumn = useAppPreferencesStore(s => s.activeWorkoutMetricColumn);
  const setMetricColumn = useAppPreferencesStore(s => s.setActiveWorkoutMetricColumn);
  const [metricMenuAnchor, setMetricMenuAnchor] = useState<AnchorRect | null>(null);
  const handlePressMetricHeader = useCallback((anchor: AnchorRect) => {
    setMetricMenuAnchor(anchor);
  }, []);

  // Superset rails, matching the workout detail presentation.
  const supersetPalette = useCSSVariable(SUPERSET_PALETTE_VARS) as string[];
  const supersetBorders = useMemo(() => {
    const runs = getSupersetRuns(cardExercises);
    const colorByEntryId = buildSupersetColorMap(runs, supersetPalette);
    const map = new Map<string, SupersetBorder>();
    for (const run of runs) {
      run.entryIds.forEach((entryId, index) => {
        const color = colorByEntryId.get(entryId);
        if (color != null) {
          map.set(entryId, { color, isLast: index === run.entryIds.length - 1 });
        }
      });
    }
    return map;
  }, [cardExercises, supersetPalette]);

  // WorkoutPreset uses snake_case `user_id` (it's a thin wrapper over server
  // JSON), unlike Exercise/FoodInfoItem which use camelCase `userId`.
  const canManagePreset = !!(
    isConnected && preset.user_id && profile?.id === preset.user_id
  );

  const { confirmAndDelete, isPending: isDeletePending } = useDeleteWorkoutPreset({
    presetId: preset.id,
    onSuccess: () => {
      Toast.show({ type: 'success', text1: 'Workout preset deleted' });
      navigation.goBack();
    },
  });

  const { startLiveWorkout, isStarting } = useStartLiveWorkout(navigation);

  const handleStartWorkout = useCallback(() => {
    void startLiveWorkout({
      name: preset.name,
      exercises: buildPresetStartExercisesPayload(preset),
    });
  }, [startLiveWorkout, preset]);

  const navigateToPresetWorkout = useCallback(() => {
    navigation.navigate('WorkoutAdd', { preset, popCount: 2 });
  }, [navigation, preset]);

  // The form path (retroactive logging) is the one that owns workout drafts,
  // so the draft-in-progress prompt lives here rather than on the live start.
  const handleLogPastWorkout = useCallback(async () => {
    const draft = await loadActiveDraft();
    if (!draft) {
      navigateToPresetWorkout();
      return;
    }

    Alert.alert(
      'Draft in Progress',
      `You have an unsaved ${draft.type === 'workout' ? 'workout' : 'activity'} draft. What would you like to do?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resume Draft',
          onPress: () => {
            navigation.navigate(draft.type === 'workout' ? 'WorkoutAdd' : 'ActivityAdd');
          },
        },
        {
          text: 'Discard & Continue',
          style: 'destructive',
          onPress: async () => {
            await clearDraft();
            navigateToPresetWorkout();
          },
        },
      ],
    );
  }, [navigateToPresetWorkout, navigation]);

  const handleEdit = useCallback(() => {
    navigation.navigate('WorkoutPresetForm', {
      mode: 'edit-preset',
      preset,
      returnKey: route.key,
    });
  }, [navigation, preset, route.key]);

  const header = useScreenHeader({
    borderless: true,
    left: { kind: 'back' },
    right: canManagePreset
      ? {
          kind: 'text',
          label: 'Edit',
          role: 'secondary',
          onPress: handleEdit,
          accessibilityLabel: 'Edit workout preset',
          identifier: 'workout-preset-detail-edit',
        }
      : null,
  });

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + activeWorkoutBarPadding + 16,
        }}
      >
        <Text className="text-2xl font-bold text-text-primary">{preset.name}</Text>
        {preset.description ? (
          <Text className="text-base text-text-secondary mt-2">{preset.description}</Text>
        ) : null}
        <Text className="text-sm text-text-muted mt-2 mb-4">
          {exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'}
        </Text>

        {cardExercises.map(cardExercise => {
          const isExpanded = !collapsedIds[cardExercise.id];
          const supersetBorder = supersetBorders.get(cardExercise.id) ?? null;
          return (
            // Grouped members carry a flat 3px left rail; interior rails run
            // to the wrapper's bottom so consecutive members read as one line.
            <View
              key={cardExercise.id}
              style={supersetBorder ? { paddingLeft: 10 } : undefined}
            >
              {supersetBorder && (
                <View
                  testID={`superset-rail-${cardExercise.id}`}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: supersetBorder.isLast && isExpanded ? 8 : 0,
                    width: 3,
                    backgroundColor: supersetBorder.color,
                  }}
                />
              )}
              <ActiveWorkoutExerciseCard
                exercise={cardExercise}
                mode="view"
                expanded={isExpanded}
                completedSetIds={{}}
                activeSetId={null}
                metricColumn={metricColumn}
                weightUnit={weightUnit}
                getImageSource={getImageSource}
                showRestChip={cardExercise.sets.length > 0}
                onToggleExpanded={toggleExpanded}
                onPressMetricHeader={handlePressMetricHeader}
              />
            </View>
          );
        })}

        <Button
          variant="primary"
          onPress={handleStartWorkout}
          disabled={isStarting || isDeletePending}
          className="mt-4"
        >
          <Text className="text-white text-base font-semibold">
            {isStarting ? 'Starting...' : 'Start workout'}
          </Text>
        </Button>

        <Button
          variant="ghost"
          onPress={() => void handleLogPastWorkout()}
          disabled={isStarting}
          className="mt-3"
          textClassName="text-text-secondary font-medium"
        >
          Log past workout
        </Button>

        {canManagePreset && (
          <Button
            variant="ghost"
            onPress={confirmAndDelete}
            disabled={isDeletePending}
            className="mt-3"
            textClassName="text-bg-danger font-medium"
          >
            {isDeletePending ? 'Deleting...' : 'Delete preset'}
          </Button>
        )}
      </ScrollView>

      <AnchoredMenu
        visible={metricMenuAnchor != null}
        anchor={metricMenuAnchor}
        onClose={() => setMetricMenuAnchor(null)}
        minWidth={160}
        items={METRIC_OPTIONS.map(option => ({
          key: option,
          label:
            option === metricColumn
              ? `✓ ${METRIC_MENU_LABELS[option]}`
              : METRIC_MENU_LABELS[option],
          onPress: () => setMetricColumn(option),
        }))}
      />
    </View>
  );
};

export default WorkoutPresetDetailScreen;
