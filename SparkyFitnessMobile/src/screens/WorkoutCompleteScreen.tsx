import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { useQuery } from '@tanstack/react-query';
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { ExerciseThumb } from '../components/ActiveWorkoutExerciseCard';
import { RPE_TONE_VARS } from '../components/ActiveWorkoutSetRow';
import Icon, { type IconName } from '../components/Icon';
import Button from '../components/ui/Button';
import { workoutSessionQueryKey } from '../hooks/queryKeys';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useNavigationActionGuard } from '../hooks/useNavigationActionGuard';
import { usePreferences } from '../hooks/usePreferences';
import { useProfile } from '../hooks/useProfile';
import { useUpdateWorkoutPreset } from '../hooks/useWorkoutPresetMutations';
import { getWorkout } from '../services/api/exerciseApi';
import { getWorkoutPresetById } from '../services/api/workoutPresetsApi';
import { getActiveServerConfig } from '../services/storage';
import { fireSuccessHaptic } from '../services/haptics';
import { withAlpha } from '../utils/colors';
import { distanceFromKm, weightFromKg } from '../utils/unitConversions';
import { formatLocalizedNumber, getAppLocale } from '../localization';
import { setsDurationMinutes } from '@workspace/shared';
import {
  buildPresetUpdateExercises,
  buildSessionDurationMinutes,
  buildWorkoutCompletionSummary,
  formatDuration,
  formatSetLoad,
  formatVolume,
  getRpeTone,
  getSessionCalories,
  isCardioModality,
  normalizeWeightUnit,
  resolveSnapshotModality,
  summarizeWorkoutSpan,
  SUPERSET_PALETTE_VARS,
} from '../utils/workoutSession';
import type { RootStackScreenProps } from '../types/navigation';
import type { WorkoutPreset } from '../types/workoutPresets';

type Props = RootStackScreenProps<'WorkoutComplete'>;

/** Keeps the update-preset alert off the confetti burst and success haptic. */
const UPDATE_PRESET_PROMPT_DELAY_MS = 800;


// --- Confetti (records variant only) ---

const CONFETTI_COLOR_VARS = [...SUPERSET_PALETTE_VARS, '--color-pr'];

/**
 * Fixed scatter (percent positions within the hero) instead of randomness:
 * deterministic renders keep the react-compiler happy and the burst identical
 * across mounts. Colors index into CONFETTI_COLOR_VARS.
 */
const CONFETTI_PIECES: {
  leftPct: number;
  topPct: number;
  width: number;
  height: number;
  colorIndex: number;
  rotateDeg?: number;
  round?: boolean;
  delayMs: number;
}[] = [
  { leftPct: 14, topPct: 18, width: 7, height: 11, colorIndex: 2, rotateDeg: -24, delayMs: 0 },
  { leftPct: 26, topPct: 56, width: 6, height: 6, colorIndex: 1, round: true, delayMs: 120 },
  { leftPct: 8, topPct: 44, width: 9, height: 5, colorIndex: 5, rotateDeg: 40, delayMs: 60 },
  { leftPct: 78, topPct: 14, width: 7, height: 11, colorIndex: 4, rotateDeg: 28, delayMs: 40 },
  { leftPct: 90, topPct: 42, width: 6, height: 6, colorIndex: 0, round: true, delayMs: 160 },
  { leftPct: 70, topPct: 58, width: 9, height: 5, colorIndex: 8, rotateDeg: -36, delayMs: 90 },
  { leftPct: 37, topPct: 10, width: 5, height: 9, colorIndex: 3, rotateDeg: 12, delayMs: 140 },
  { leftPct: 60, topPct: 6, width: 6, height: 6, colorIndex: 2, round: true, delayMs: 20 },
  { leftPct: 48, topPct: 52, width: 7, height: 10, colorIndex: 8, rotateDeg: 52, delayMs: 180 },
  { leftPct: 84, topPct: 62, width: 5, height: 9, colorIndex: 3, rotateDeg: -14, delayMs: 110 },
  { leftPct: 20, topPct: 8, width: 6, height: 6, colorIndex: 6, round: true, delayMs: 200 },
  { leftPct: 55, topPct: 30, width: 8, height: 5, colorIndex: 0, rotateDeg: 20, delayMs: 70 },
];

function ConfettiPiece({
  piece,
  color,
}: {
  piece: (typeof CONFETTI_PIECES)[number];
  color: string;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(piece.delayMs, withTiming(1, { duration: 1100 }));
    return () => cancelAnimation(progress);
  }, [piece.delayMs, progress]);

  const rotateDeg = piece.rotateDeg ?? 0;
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.12, 0.7, 1], [0, 0.85, 0.75, 0]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [-16, 36]) },
      { rotate: `${rotateDeg + progress.value * 30}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: `${piece.leftPct}%`,
          top: `${piece.topPct}%`,
          width: piece.width,
          height: piece.height,
          borderRadius: piece.round ? piece.width / 2 : 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

function ConfettiBurst() {
  const reducedMotion = useReducedMotion();
  const palette = useCSSVariable(CONFETTI_COLOR_VARS) as string[];
  if (reducedMotion) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {CONFETTI_PIECES.map((piece, index) => (
        <ConfettiPiece key={index} piece={piece} color={String(palette[piece.colorIndex])} />
      ))}
    </View>
  );
}

// --- Hero check pop ---

function HeroCheck() {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(reducedMotion ? 1 : 0.4);
  useEffect(() => {
    scale.value = withSpring(1, { damping: 14, stiffness: 220 });
  }, [scale]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View
      className="w-16 h-16 rounded-full bg-accent-primary items-center justify-center"
      style={animatedStyle}
    >
      <Icon name="checkmark" size={32} color="#ffffff" />
    </Animated.View>
  );
}

/** Pulsing placeholder for the calories tile while the post-save refetch runs. */
function CaloriesShimmer() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reducedMotion) return;
    opacity.value = withRepeat(
      withSequence(withTiming(0.45, { duration: 650 }), withTiming(1, { duration: 650 })),
      -1,
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reducedMotion]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={animatedStyle} accessibilityLabel={t('workoutComplete.accessibility.calculating', { defaultValue: 'Calculating' })}>
      <View className="bg-raised rounded-md mt-1" style={{ width: 58, height: 20 }} />
    </Animated.View>
  );
}

function StatTile({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: ReactNode;
}) {
  const textMuted = String(useCSSVariable('--color-text-muted'));
  return (
    <View className="flex-1 bg-surface rounded-xl shadow-sm px-3.5 py-3">
      <View className="flex-row items-center gap-1">
        <Icon name={icon} size={12} color={textMuted} />
        <Text
          className="text-xs font-semibold uppercase text-text-muted"
          style={{ letterSpacing: 0.6 }}
        >
          {label}
        </Text>
      </View>
      {children}
    </View>
  );
}

function StatValue({ value, unit }: { value: string; unit?: string }) {
  return (
    <Text
      className="text-xl font-bold text-text-primary mt-0.5"
      style={{ fontVariant: ['tabular-nums'] }}
    >
      {value}
      {unit != null && <Text className="text-sm font-semibold text-text-secondary"> {unit}</Text>}
    </Text>
  );
}

function DockedActionButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const textMuted = String(useCSSVariable('--color-text-muted'));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 flex-row items-center justify-center gap-1.5 bg-raised rounded-xl py-3"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Icon name={icon} size={16} color={textMuted} />
      <Text className="text-sm font-semibold text-text-primary">{label}</Text>
    </Pressable>
  );
}

function WorkoutCompleteScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const {
    session,
    completedSetIds,
    prSetIds,
    startedAt,
    finishedAt,
    sourcePresetId,
    sourceServerConfigId,
    plannedSetValues,
  } = route.params;

  const { preferences } = usePreferences();
  const weightUnit = normalizeWeightUnit(preferences?.default_weight_unit);
  const distanceUnit = (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
  const { getImageSource } = useExerciseImageSource();
  const { runNavigationAction } = useNavigationActionGuard(navigation);

  const prColor = String(useCSSVariable('--color-pr'));

  const summary = useMemo(
    () => buildWorkoutCompletionSummary(session, completedSetIds, prSetIds, t),
    [session, completedSetIds, prSetIds, t],
  );
  const hasRecords = summary.prRows.length > 0;

  // Recomputed with the same construction the final flush stamps — cardio
  // entries are their set sums, strength entries their wall-clock split
  // share — so the number can't disagree with the diary even when the flush
  // response never folded back into this snapshot (or an entry carries a
  // stale duration). The stamped/span fallbacks cover sessions the split
  // can't price: no startedAt, or a resumed session whose completions all
  // predate this start.
  const durationMinutes = useMemo(() => {
    // A non-null split means this session priced itself (something completed
    // after start); null means it didn't, and the server-stamped durations
    // are the better truth.
    const split = buildSessionDurationMinutes(session, completedSetIds, startedAt);
    if (split != null) {
      const derived = session.exercises.reduce(
        (sum, e) =>
          sum +
          (isCardioModality(resolveSnapshotModality(e.exercise_snapshot))
            ? setsDurationMinutes(e.sets)
            : (split.get(e.id) ?? 0)),
        0,
      );
      if (derived > 0) return derived;
    }
    const stamped = session.exercises.reduce((sum, e) => sum + (e.duration_minutes ?? 0), 0);
    if (stamped > 0) return stamped;
    return summarizeWorkoutSpan(completedSetIds, startedAt)?.totalMinutes ?? 0;
  }, [session, completedSetIds, startedAt]);

  // Calories are the one server-computed number on this screen: the snapshot
  // usually already carries them (the flush response is server truth), and one
  // post-save refetch covers the rest. Everything else renders client-side.
  const { data: refreshedSession, isError: caloriesFailed } = useQuery({
    queryKey: workoutSessionQueryKey(session.id),
    queryFn: () => getWorkout(session.id),
  });
  const snapshotCalories = getSessionCalories(session);
  const caloriesValue =
    refreshedSession != null
      ? getSessionCalories(refreshedSession)
      : snapshotCalories > 0
        ? snapshotCalories
        : null;

  // Success haptic belongs to the records celebration only; plain completions
  // get the check pop without it.
  useEffect(() => {
    if (hasRecords) fireSuccessHaptic();
  }, [hasRecords]);

  // --- Update-preset prompt ---
  //
  // A workout started from a preset offers to fold today's values and
  // structure back into it when they deviate. The diff baseline is a fresh
  // one-shot fetch (deliberately uncached — a same-preset re-finish must not
  // see pre-update data), so presets edited or deleted mid-workout are
  // handled; any fetch error just suppresses the prompt.
  const { profile } = useProfile();
  const isFocused = useIsFocused();
  const { updatePresetAsync } = useUpdateWorkoutPreset();
  const [sourcePreset, setSourcePreset] = useState<WorkoutPreset | null>(null);
  const promptedRef = useRef(false);

  useEffect(() => {
    if (sourcePresetId == null) return;
    let cancelled = false;
    void (async () => {
      try {
        // Preset ids are per-server; a config switched since the workout
        // started would resolve the id against the wrong server.
        const config = await getActiveServerConfig();
        if (cancelled || config?.id !== sourceServerConfigId) return;
        const preset = await getWorkoutPresetById(sourcePresetId);
        if (!cancelled) setSourcePreset(preset);
      } catch {
        // Deleted mid-workout (404) or unreachable — no prompt.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourcePresetId, sourceServerConfigId]);

  const presetUpdateExercises = useMemo(
    () =>
      sourcePreset == null
        ? null
        : buildPresetUpdateExercises(session, sourcePreset, { completedSetIds, plannedSetValues }),
    [sourcePreset, session, completedSetIds, plannedSetValues],
  );

  useEffect(() => {
    if (promptedRef.current || !isFocused) return;
    if (sourcePreset == null || presetUpdateExercises == null) return;
    // The server 403s non-owner updates (shared/public presets) — don't offer.
    if (!sourcePreset.user_id || profile?.id !== sourcePreset.user_id) return;
    const presetId = sourcePreset.id;
    const exercises = presetUpdateExercises;
    const timer = setTimeout(() => {
      // Marked only when the alert actually shows, so an unfocused pass (a
      // pushed screen covering this one) doesn't burn the one shot; refocus
      // re-runs the effect and fires it then.
      promptedRef.current = true;
      Alert.alert(
        t('workoutComplete.confirm.updatePresetTitle', { defaultValue: 'Update preset?' }),
        t('workoutComplete.confirm.updatePresetMessage', { defaultValue: 'Today\'s workout differs from \"{{preset}}\". Update the preset to match?', preset: sourcePreset.name }),
        [
          { text: t('workoutComplete.actions.keepPreset', { defaultValue: 'Keep Preset' }), style: 'cancel' },
          {
            text: t('workoutComplete.actions.update', { defaultValue: 'Update' }),
            onPress: () => {
              void (async () => {
                try {
                  await updatePresetAsync({ id: presetId, payload: { exercises } });
                  Toast.show({ type: 'success', text1: t('workoutComplete.success.presetUpdated', { defaultValue: 'Preset updated' }) });
                } catch {
                  // useUpdateWorkoutPreset already showed the failure toast.
                }
              })();
            },
          },
        ],
      );
    }, UPDATE_PRESET_PROMPT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isFocused, sourcePreset, presetUpdateExercises, profile?.id, updatePresetAsync, t]);

  const rpeTone = summary.averageRpe != null ? getRpeTone(summary.averageRpe) : null;
  const rpeToneColor = String(
    useCSSVariable(RPE_TONE_VARS[rpeTone ?? 'easy']),
  );

  const finishedTimeText = new Date(finishedAt).toLocaleTimeString(getAppLocale(), {
    hour: 'numeric',
    minute: '2-digit',
  });

  const sessionForDetail = refreshedSession ?? session;
  const handleViewWorkout = () => {
    runNavigationAction(() => {
      navigation.navigate('WorkoutDetail', { session: sessionForDetail });
    });
  };
  const handleSaveAsPreset = () => {
    runNavigationAction(() => {
      navigation.navigate('WorkoutPresetForm', {
        mode: 'create-preset',
        sourceSession: sessionForDetail,
      });
    });
  };
  const handleDone = () => {
    navigation.navigate('Tabs', { screen: 'Diary' });
  };

  const allSetsLogged = summary.completedSetCount === summary.totalSetCount;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="items-center px-6 pt-7 pb-5">
          {hasRecords && <ConfettiBurst />}
          <HeroCheck />
          <Text className="text-2xl font-bold text-text-primary mt-3">{t('workoutComplete.title', { defaultValue: 'Workout Complete' })}</Text>
          <Text className="text-[15px] font-semibold text-text-secondary mt-1">
            {session.name}
          </Text>
          <Text className="text-sm font-medium text-text-muted mt-1">
            {allSetsLogged
              ? t('workoutComplete.labels.allSets', { defaultValue: '{{count}} sets', count: summary.totalSetCount })
              : t('workoutComplete.labels.partialSets', {
                  defaultValue: '{{completed}} of {{total}} sets',
                  completed: summary.completedSetCount,
                  total: summary.totalSetCount,
                })}
          </Text>
          <Text className="text-sm font-medium text-text-muted">
            {t('workoutComplete.labels.todayAt', { defaultValue: ' · Today at ' })}
            {finishedTimeText}
          </Text>
        </View>

        <View className="px-4">
          <View className="flex-row gap-2">
            <StatTile icon="timer" label={t('workoutComplete.stats.duration', { defaultValue: 'Duration' })}>
              <StatValue value={durationMinutes > 0 ? formatDuration(durationMinutes) : '—'} />
            </StatTile>
            <StatTile icon="exercise-weights" label={t('workoutComplete.stats.volume', { defaultValue: 'Volume' })}>
              {summary.volumeKg > 0 ? (
                <StatValue
                  value={formatLocalizedNumber(Math.round(weightFromKg(summary.volumeKg, weightUnit)))}
                  unit={weightUnit}
                />
              ) : (
                <StatValue value="—" />
              )}
            </StatTile>
          </View>
          <View className="flex-row gap-2 mt-2">
            <StatTile icon="checkmark-circle" label={t('workoutComplete.stats.sets', { defaultValue: 'Sets' })}>
              <Text
                className="text-xl font-bold text-text-primary mt-0.5"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {summary.completedSetCount}
                <Text className="text-sm font-semibold text-text-secondary">
                  {' '}
                  / {summary.totalSetCount}
                  {summary.skippedSetCount > 0 && <> · {summary.skippedSetCount} {t('workoutComplete.labels.skipped', { defaultValue: 'skipped' })}</>}
                </Text>
              </Text>
            </StatTile>
            <StatTile icon="flame" label={t('workoutComplete.stats.calories', { defaultValue: 'Calories' })}>
              {caloriesValue != null ? (
                <StatValue value={formatLocalizedNumber(Math.round(caloriesValue))} unit={t('nutrition.caloriesShort', { defaultValue: "kcal" })} />
              ) : caloriesFailed ? (
                <StatValue value="—" />
              ) : (
                <CaloriesShimmer />
              )}
            </StatTile>
          </View>

          {summary.totalDistanceKm > 0 && (
            <View className="flex-row gap-2 mt-2">
              <StatTile icon="exercise-running" label={t('workoutComplete.stats.distance', { defaultValue: 'Distance' })}>
                <StatValue
                  value={formatLocalizedNumber(distanceFromKm(summary.totalDistanceKm, distanceUnit), { maximumFractionDigits: 2 })}
                  unit={distanceUnit === 'miles' ? 'mi' : 'km'}
                />
              </StatTile>
            </View>
          )}

          {summary.averageRpe != null && rpeTone != null && (
            <View className="flex-row items-center bg-surface rounded-xl shadow-sm px-3.5 py-3 mt-2">
              <Text
                className="text-xs font-semibold uppercase text-text-muted"
                style={{ letterSpacing: 0.6 }}
              >
                {t('workoutComplete.stats.averageRpe', { defaultValue: 'Average RPE' })}
              </Text>
              <Text className="text-xs font-semibold ml-auto" style={{ color: rpeToneColor }}>
                {({ easy: t('workoutComplete.rpe.easy', { defaultValue: 'Easy' }), moderate: t('workoutComplete.rpe.moderate', { defaultValue: 'Moderate' }), hard: t('workoutComplete.rpe.hard', { defaultValue: 'Hard' }), max: t('workoutComplete.rpe.max', { defaultValue: 'Max effort' }) })[rpeTone]}
              </Text>
              <Text
                className="text-base font-bold ml-2"
                style={{ color: rpeToneColor, fontVariant: ['tabular-nums'] }}
              >
                {formatLocalizedNumber(parseFloat(summary.averageRpe.toFixed(1)), { maximumFractionDigits: 1 })}
              </Text>
            </View>
          )}

          {hasRecords && (
            <View className="bg-surface rounded-xl shadow-sm mt-2 overflow-hidden">
              <View className="flex-row items-center gap-2.5 px-3.5 pt-3 pb-2.5">
                <View
                  className="w-8 h-8 rounded-lg items-center justify-center"
                  style={{ backgroundColor: withAlpha(prColor, 0.13) }}
                >
                  <Icon name="trophy" size={17} color={prColor} />
                </View>
                <Text className="text-sm font-bold text-text-primary">
                  {t('workoutComplete.labels.personalRecordCount', {
                    count: summary.prRows.length,
                    formattedCount: formatLocalizedNumber(summary.prRows.length),
                    defaultValue: '{{formattedCount}} Personal Records',
                    defaultValue_one: '{{formattedCount}} Personal Record',
                    defaultValue_other: '{{formattedCount}} Personal Records',
                  })}
                </Text>
              </View>
              {summary.prRows.map((pr, index) => (
                <View
                  key={index}
                  className="flex-row items-baseline gap-2 px-3.5 py-2 border-t border-border-subtle"
                >
                  <Text
                    className="flex-1 text-sm font-semibold text-text-primary"
                    numberOfLines={1}
                  >
                    {pr.exerciseName}
                  </Text>
                  <Text
                    className="text-sm font-medium"
                    style={{ color: prColor, fontVariant: ['tabular-nums'] }}
                  >
                    {formatSetLoad(
                      { weightKg: pr.weightKg, reps: pr.reps, durationSec: pr.durationSec },
                      weightUnit,
                      t,
                    ) ?? ''}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View className="flex-row items-baseline px-4 pt-6 pb-1.5">
          <Text
            className="text-xs font-bold uppercase text-text-muted"
            style={{ letterSpacing: 1 }}
          >
            {t('workoutComplete.sections.exercises', { defaultValue: 'Exercises' })}
          </Text>
          <Text
            className="ml-auto text-xs font-bold uppercase text-text-muted"
            style={{ letterSpacing: 1 }}
          >
            {t('workoutComplete.sections.volume', { defaultValue: 'Volume' })}
          </Text>
        </View>
        <View className="border-t border-border-subtle">
          {summary.exercises.map((row) => {
            const entry = session.exercises.find((e) => e.id === row.entryId);
            const topText =
              row.topSet != null
                ? formatSetLoad(
                    {
                      weightKg: row.topSet.weightKg,
                      reps: row.topSet.reps,
                      durationSec: row.topSet.durationSec,
                    },
                    weightUnit,
                    t,
                  )
                : null;
            return (
              <View
                key={row.entryId}
                className="flex-row items-center gap-3 px-4 py-3 border-b border-border-subtle"
              >
                {entry != null && (
                  <ExerciseThumb exercise={entry} getImageSource={getImageSource} size={38} />
                )}
                <View className="flex-1">
                  <View className="flex-row items-center gap-1.5">
                    <Text
                      className="text-sm font-semibold text-text-primary shrink"
                      numberOfLines={1}
                    >
                      {row.name}
                    </Text>
                    {row.hasPr && <Icon name="trophy" size={14} color={prColor} />}
                  </View>
                  <Text
                    className="text-xs font-medium text-text-secondary mt-0.5"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    <Text className="font-semibold">
                      {row.completedSetCount === row.totalSetCount
                        ? t('workoutComplete.labels.allSets', { defaultValue: '{{count}} sets', count: row.totalSetCount })
                        : t('workoutComplete.labels.partialSets', { defaultValue: '{{completed}} of {{total}} sets', completed: row.completedSetCount, total: row.totalSetCount })}
                    </Text>
                    {topText != null && ` · ${t('workoutComplete.labels.top', { defaultValue: 'top' })} ${topText}`}
                  </Text>
                  {row.notes != null && (
                    <Text className="text-xs italic text-text-muted mt-0.5" numberOfLines={1}>
                      “{row.notes}”
                    </Text>
                  )}
                </View>
                <Text
                  className="text-sm font-medium text-text-primary"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {row.volumeKg > 0 ? formatVolume(row.volumeKg, weightUnit) : '—'}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View
        className="bg-surface border-t border-border-subtle px-4 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <View className="flex-row gap-2 mb-2">
          <DockedActionButton icon="bookmark" label={t('workoutComplete.actions.saveAsPreset', { defaultValue: 'Save as Preset' })} onPress={handleSaveAsPreset} />
          <DockedActionButton icon="list" label={t('workoutComplete.actions.viewWorkout', { defaultValue: 'View Workout' })} onPress={handleViewWorkout} />
        </View>
        <Button variant="primary" onPress={handleDone}>
          {t('workoutComplete.actions.done', { defaultValue: 'Done' })}
        </Button>
      </View>
    </View>
  );
}

export default WorkoutCompleteScreen;
