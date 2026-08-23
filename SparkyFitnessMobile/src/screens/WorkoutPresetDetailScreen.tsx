import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View, Text, ScrollView } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from '../components/ui/Button';
import ActiveWorkoutExerciseCard from '../components/ActiveWorkoutExerciseCard';
import { MetricColumnMenu } from '../components/WorkoutMenus';
import { type AnchorRect } from '../components/AnchoredMenu';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { clearDraft, loadActiveDraft } from '../services/workoutDraftService';
import {
  useCreateWorkoutPreset,
  useDeleteWorkoutPreset,
  usePreferences,
  useProfile,
  useServerConnection,
  useUpdateWorkoutPreset,
} from '../hooks';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useScreenHeader, type HeaderItem } from '../hooks/useScreenHeader';
import { useStartLiveWorkout } from '../hooks/useStartLiveWorkout';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { useDiaryDateStore } from '../stores/diaryDateStore';
import {
  buildPresetStartExercisesPayload,
  makeSparseExercise,
  presetExerciseToCardExercise,
} from '../utils/workoutSession';
import { useSupersetBorders } from '../components/ActiveWorkoutRail';
import type { RootStackScreenProps } from '../types/navigation';

type WorkoutPresetDetailScreenProps =
  RootStackScreenProps<'WorkoutPresetDetail'>;

const WorkoutPresetDetailScreen: React.FC<WorkoutPresetDetailScreenProps> = ({
  navigation,
  route,
}) => {
  const preset = route.params.updatedPreset ?? route.params.preset;
  const { t } = useTranslation();
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
  const distanceUnit =
    (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
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

  // Tap an exercise thumbnail → its library detail. Preset rows carry only a
  // sparse snapshot, so the detail screen hydrates the full record by id.
  const handleViewExercise = useCallback(
    (entryId: string) => {
      const card = cardExercises.find(c => c.id === entryId);
      if (!card) return;
      navigation.navigate('ExerciseDetail', {
        item: makeSparseExercise(
          {
            id: card.exercise_id,
            name: card.exercise_snapshot?.name,
            category: card.exercise_snapshot?.category,
            images: card.exercise_snapshot?.images,
          },
          t,
        ),
        hideWorkoutActions: true,
      });
    },
    [cardExercises, navigation, t],
  );

  // Metric column is shared with the workout screens (intended). Preset sets
  // store no RPE, so an 'rpe' selection falls back to volume for display and
  // the picker hides the RPE option — same as the preset form.
  const metricColumn = useAppPreferencesStore(s => s.activeWorkoutMetricColumn);
  const effectiveMetricColumn =
    metricColumn === 'rpe' ? 'volume' : metricColumn;
  const [metricMenu, setMetricMenu] = useState<{
    anchor: AnchorRect;
    clampedToRpe: boolean;
  } | null>(null);
  const handlePressMetricHeader = useCallback(
    (anchor: AnchorRect, clampedToRpe: boolean) => {
      setMetricMenu({ anchor, clampedToRpe });
    },
    [],
  );

  // Superset rails, matching the workout detail presentation.
  const { borders: supersetBorders } = useSupersetBorders(cardExercises);

  // WorkoutPreset uses snake_case `user_id` (it's a thin wrapper over server
  // JSON), unlike Exercise/FoodInfoItem which use camelCase `userId`.
  const canManagePreset = !!(
    isConnected &&
    preset.user_id &&
    profile?.id === preset.user_id
  );

  const isPublic = !!preset.is_public;
  const { updatePresetAsync, isPending: isSharePending } =
    useUpdateWorkoutPreset();

  const handleToggleShare = useCallback(async () => {
    const nextIsPublic = !isPublic;
    const runUpdate = async () => {
      try {
        const updated = await updatePresetAsync({
          id: preset.id,
          payload: { is_public: nextIsPublic },
        });
        navigation.setParams({ updatedPreset: updated });
        Toast.show({
          type: 'success',
          text1: updated.is_public
            ? t('workoutPresetDetail.toast.shared', {
                defaultValue: 'Workout preset shared publicly',
              })
            : t('workoutPresetDetail.toast.private', {
                defaultValue: 'Workout preset made private',
              }),
        });
      } catch {
        // useUpdateWorkoutPreset hook already shows error Toast on failure
      }
    };

    if (nextIsPublic) {
      Alert.alert(
        t('workoutPresetDetail.share.title', { defaultValue: 'Make public?' }),
        t('workoutPresetDetail.share.message', {
          defaultValue:
            'This workout preset will become visible to all users on this server.',
        }),
        [
          {
            text: t('common.cancel', { defaultValue: 'Cancel' }),
            style: 'cancel',
          },
          {
            text: t('workoutPresetDetail.share.confirm', {
              defaultValue: 'Make public',
            }),
            onPress: () => void runUpdate(),
          },
        ],
      );
    } else {
      void runUpdate();
    }
  }, [preset.id, isPublic, updatePresetAsync, navigation, t]);

  const { confirmAndDelete, isPending: isDeletePending } =
    useDeleteWorkoutPreset({
      presetId: preset.id,
      onSuccess: () => {
        Toast.show({
          type: 'success',
          text1: t('workoutPresetDetail.toast.deleted', {
            defaultValue: 'Workout preset deleted',
          }),
        });
        navigation.goBack();
      },
    });

  const { startLiveWorkout, isStarting } = useStartLiveWorkout(navigation);

  const handleStartWorkout = useCallback(() => {
    void startLiveWorkout({
      name: preset.name,
      exercises: buildPresetStartExercisesPayload(preset),
      sourcePresetId: preset.id,
    });
  }, [startLiveWorkout, preset]);

  const navigateToPresetWorkout = useCallback(() => {
    navigation.navigate('WorkoutAdd', {
      preset,
      popCount: 2,
      date: useDiaryDateStore.getState().selectedDate,
    });
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
      t('workoutPresetDetail.draft.title', {
        defaultValue: 'Draft in Progress',
      }),
      t('workoutPresetDetail.draft.message', {
        defaultValue:
          'You have an unsaved {{type}} draft. What would you like to do?',
        type:
          draft.type === 'workout'
            ? t('workoutPresetDetail.draft.workout', {
                defaultValue: 'workout',
              })
            : t('workoutPresetDetail.draft.activity', {
                defaultValue: 'activity',
              }),
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('workoutPresetDetail.draft.resume', {
            defaultValue: 'Resume Draft',
          }),
          onPress: () => {
            navigation.navigate(
              draft.type === 'workout' ? 'WorkoutAdd' : 'ActivityAdd',
            );
          },
        },
        {
          text: t('workoutPresetDetail.draft.discard', {
            defaultValue: 'Discard & Continue',
          }),
          style: 'destructive',
          onPress: async () => {
            await clearDraft();
            navigateToPresetWorkout();
          },
        },
      ],
    );
  }, [navigateToPresetWorkout, navigation, t]);

  const handleEdit = useCallback(() => {
    navigation.navigate('WorkoutPresetForm', {
      mode: 'edit-preset',
      preset,
      returnKey: route.key,
    });
  }, [navigation, preset, route.key]);

  // Available regardless of ownership (unlike Share/Edit below) — duplicating
  // someone else's public preset is exactly how you'd fork it into your own
  // library.
  const { createPresetAsync, isPending: isDuplicatePending } =
    useCreateWorkoutPreset();
  const handleDuplicatePreset = useCallback(async () => {
    try {
      const created = await createPresetAsync({
        name: t('workoutPresetDetail.duplicateName', {
          defaultValue: '{{name}} (Copy)',
          name: preset.name,
        }),
        description: preset.description,
        is_public: false,
        // The list/detail read queries never select wpe.sort_order (see
        // workoutPresetRepository), so exercise.sort_order is always
        // undefined here — every duplicated row would otherwise insert with
        // the same sort_order and rely on id-ASC as a display-order tiebreak.
        // preset.exercises already arrives in display order (server sorts by
        // sort_order then id), so the array index is the real sort_order.
        exercises: preset.exercises.map((exercise, index) => ({
          exercise_id: exercise.exercise_id,
          image_url: exercise.image_url,
          sort_order: index,
          superset_group: exercise.superset_group,
          sets: exercise.sets.map(set => ({
            set_number: set.set_number,
            set_type: set.set_type,
            reps: set.reps,
            weight: set.weight,
            duration: set.duration,
            distance: set.distance,
            rest_time: set.rest_time,
            notes: set.notes,
          })),
        })),
      });
      Toast.show({
        type: 'success',
        text1: t('workoutPresetDetail.toast.duplicated', {
          defaultValue: 'Workout preset duplicated',
        }),
      });
      // navigate() to the route already focused replaces its params instead of
      // pushing a new screen (React Navigation 7) — push so Back still returns
      // to the original preset instead of the fresh copy. Same fix as
      // MealDetailScreen's MealDetail -> MealDetail link.
      navigation.push('WorkoutPresetDetail', { preset: created });
    } catch {
      // useCreateWorkoutPreset already shows an error Toast on failure.
    }
  }, [createPresetAsync, preset, navigation, t]);

  const rightItems: HeaderItem[] = canManagePreset
    ? [
        {
          kind: 'icon',
          sfSymbol: isPublic ? 'lock.fill' : 'square.and.arrow.up',
          ionicon: isPublic ? 'lock-closed-outline' : 'share-social-outline',
          role: 'secondary',
          useIoniconOnIOS: !isPublic,
          disabled: isSharePending,
          onPress: handleToggleShare,
          accessibilityLabel: isPublic
            ? t('workoutPresetDetail.accessibility.makePrivate', {
                defaultValue: 'Make private',
              })
            : t('workoutPresetDetail.accessibility.sharePublic', {
                defaultValue: 'Share with public',
              }),
          identifier: 'workout-preset-detail-share',
        } as const,
        {
          kind: 'text',
          label: t('common.edit', { defaultValue: 'Edit' }),
          role: 'secondary',
          onPress: handleEdit,
          accessibilityLabel: t('workoutPresetDetail.accessibility.edit', {
            defaultValue: 'Edit workout preset',
          }),
          identifier: 'workout-preset-detail-edit',
        } as const,
      ]
    : [];

  const header = useScreenHeader({
    title: preset.name,
    nativeTitle: preset.name,
    borderless: true,
    left: { kind: 'back' },
    right: rightItems.length > 0 ? rightItems : null,
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + activeWorkoutBarPadding + 16,
        }}
      >
        {preset.description ? (
          <Text className="text-base text-text-secondary mt-2">
            {preset.description}
          </Text>
        ) : null}
        <Text className="text-sm text-text-muted mt-2 mb-4">
          {t('workoutPresetDetail.exerciseCount', {
            count: exerciseCount,
            defaultValue: '{{count}} exercises',
            defaultValue_one: '{{count}} exercise',
            defaultValue_other: '{{count}} exercises',
          })}
        </Text>

        {/* Pull back part of the scroll container's 16px inset so the cards
            sit at the same 12px inset as the active workout screen (px-3). */}
        <View className="-mx-1">
          {cardExercises.map(cardExercise => {
            const isExpanded = !collapsedIds[cardExercise.id];
            const supersetBorder = supersetBorders.get(cardExercise.id) ?? null;
            return (
              // Grouped members carry a flat 3px left rail; interior rails run
              // to the wrapper's bottom so consecutive members read as one line.
              <Animated.View
                key={cardExercise.id}
                layout={LinearTransition.duration(300)}
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
                  metricColumn={effectiveMetricColumn}
                  weightUnit={weightUnit}
                  distanceUnit={distanceUnit}
                  getImageSource={getImageSource}
                  showRestChip={cardExercise.sets.length > 0}
                  onPressThumb={handleViewExercise}
                  onToggleExpanded={toggleExpanded}
                  onPressMetricHeader={handlePressMetricHeader}
                />
              </Animated.View>
            );
          })}
        </View>

        <Button
          variant="primary"
          onPress={handleStartWorkout}
          disabled={isStarting || isDeletePending}
          className="mt-4"
        >
          <Text className="text-white text-base font-semibold">
            {isStarting
              ? t('workoutPresetDetail.actions.starting', {
                  defaultValue: 'Starting…',
                })
              : t('workoutPresetDetail.actions.start', {
                  defaultValue: 'Start workout',
                })}
          </Text>
        </Button>

        <Button
          variant="ghost"
          onPress={() => void handleLogPastWorkout()}
          disabled={isStarting}
          className="mt-3"
          textClassName="text-text-secondary font-medium"
        >
          {t('workoutPresetDetail.actions.logPast', {
            defaultValue: 'Log past workout',
          })}
        </Button>

        <Button
          variant="ghost"
          onPress={() => void handleDuplicatePreset()}
          disabled={isDuplicatePending}
          className="mt-3"
          textClassName="text-text-secondary font-medium"
          accessibilityLabel={t('workoutPresetDetail.accessibility.duplicate', {
            defaultValue: 'Duplicate workout preset',
          })}
        >
          {isDuplicatePending
            ? t('workoutPresetDetail.actions.duplicating', {
                defaultValue: 'Duplicating…',
              })
            : t('workoutPresetDetail.actions.duplicate', {
                defaultValue: 'Duplicate preset',
              })}
        </Button>

        {canManagePreset && (
          <Button
            variant="destructive"
            onPress={confirmAndDelete}
            disabled={isDeletePending}
            className="mt-3"
          >
            {isDeletePending
              ? t('workoutPresetDetail.actions.deleting', {
                  defaultValue: 'Deleting…',
                })
              : t('workoutPresetDetail.actions.delete', {
                  defaultValue: 'Delete preset',
                })}
          </Button>
        )}
      </ScrollView>

      <MetricColumnMenu
        anchor={metricMenu?.anchor ?? null}
        onClose={() => setMetricMenu(null)}
        includeRpe={false}
        includeWeightMetrics={!metricMenu?.clampedToRpe}
      />
    </View>
  );
};

export default WorkoutPresetDetailScreen;
