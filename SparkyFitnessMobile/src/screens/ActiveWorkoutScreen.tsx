import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { LinearTransition } from 'react-native-reanimated';
import Toast from 'react-native-toast-message';
import { useQueryClient } from '@tanstack/react-query';
import { useCSSVariable } from 'uniwind';

import ActiveWorkoutHeader, {
  buildExerciseProgress,
} from '../components/ActiveWorkoutHeader';
import ActiveWorkoutRail from '../components/ActiveWorkoutRail';
import ActiveWorkoutExerciseCard, {
  METRIC_MENU_LABELS,
  METRIC_OPTIONS,
} from '../components/ActiveWorkoutExerciseCard';
import ActiveWorkoutRestBar from '../components/ActiveWorkoutRestBar';
import AnchoredMenu, { type AnchorRect } from '../components/AnchoredMenu';
import RestPeriodSheet, { type RestPeriodSheetRef } from '../components/RestPeriodSheet';
import Button from '../components/ui/Button';
import { useActiveWorkoutAutosave } from '../hooks/useActiveWorkoutAutosave';
import { invalidateExerciseCache } from '../hooks/invalidateExerciseCache';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useNavigationActionGuard } from '../hooks/useNavigationActionGuard';
import { usePreferences } from '../hooks/usePreferences';
import { useSelectedExercise } from '../hooks/useSelectedExercise';
import { deleteWorkout } from '../services/api/exerciseApi';
import { addLog } from '../services/LogService';
import { useActiveWorkoutStore, type ActiveSetPatch } from '../stores/activeWorkoutStore';
import { normalizeDate } from '../utils/dateUtils';
import {
  buildSupersetColorMap,
  getSupersetRuns,
  SET_TYPE_OPTIONS,
  SUPERSET_PALETTE_VARS,
} from '../utils/workoutSession';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { SupersetBorder } from '../components/ActiveWorkoutRail';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'ActiveWorkout'>;

function ActiveWorkoutScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const session = useActiveWorkoutStore((s) => s.session);
  const sessionId = useActiveWorkoutStore((s) => s.sessionId);
  const startedAt = useActiveWorkoutStore((s) => s.startedAt);
  const completedSetIds = useActiveWorkoutStore((s) => s.completedSetIds);
  const activeSetId = useActiveWorkoutStore((s) => s.activeSetId);
  const restState = useActiveWorkoutStore((s) => s.rest.state);
  const restEndsAt = useActiveWorkoutStore((s) => s.rest.endsAt);
  const restPausedRemainingMs = useActiveWorkoutStore((s) => s.rest.pausedRemainingMs);
  const restDurationSec = useActiveWorkoutStore((s) => s.rest.durationSec);
  const createdByLiveStart = useActiveWorkoutStore((s) => s.createdByLiveStart);
  const queryClient = useQueryClient();

  const metricColumn = useAppPreferencesStore((s) => s.activeWorkoutMetricColumn);
  const setMetricColumn = useAppPreferencesStore((s) => s.setActiveWorkoutMetricColumn);

  const { preferences } = usePreferences();
  const weightUnit = (preferences?.default_weight_unit ?? 'kg') as 'kg' | 'lbs';
  const { getImageSource } = useExerciseImageSource();
  const { flush } = useActiveWorkoutAutosave();
  const { runNavigationAction } = useNavigationActionGuard(navigation);

  // One 1s tick drives the elapsed clock, the rest countdown, and the guarded
  // rest-complete transition (the floating HUD is hidden on this route, so
  // this screen owns `markRestReady`). Set rows are memoized, so ticks only
  // re-render the header and rest bar.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (restState === 'resting' && restEndsAt != null && now >= restEndsAt) {
      useActiveWorkoutStore.getState().markRestReady();
    }
  }, [restState, restEndsAt, now]);

  // Flush unsaved edits when the screen loses focus, and on mount when a cold
  // start rehydrated a dirty session (the autosave hook wasn't mounted to see
  // that revision).
  useEffect(() => {
    if (useActiveWorkoutStore.getState().hasUnsavedChanges) void flush();
    const unsubscribe = navigation.addListener('blur', () => {
      void flush();
    });
    return unsubscribe;
  }, [navigation, flush]);

  // If the route is opened with no live workout (stale deep link), bail out.
  // Finish/Discard clear the session themselves and own their navigation, so
  // this only auto-pops when the screen *arrived* without a session.
  const hadSessionRef = useRef(sessionId != null);
  useEffect(() => {
    if (sessionId != null) {
      hadSessionRef.current = true;
      return;
    }
    if (!hadSessionRef.current && navigation.canGoBack()) navigation.goBack();
  }, [sessionId, navigation]);

  const activeExerciseId = useMemo(() => {
    if (session == null || activeSetId == null) return null;
    return (
      session.exercises.find((e) => e.sets.some((s) => String(s.id) === activeSetId))?.id ??
      null
    );
  }, [session, activeSetId]);

  // Superset display: adjacent 2+ runs get a flat left rail (log cards) and a
  // bottom bar (rail thumbs) in a per-group palette color.
  const supersetPalette = useCSSVariable(SUPERSET_PALETTE_VARS) as string[];
  const supersetRuns = useMemo(() => getSupersetRuns(session?.exercises ?? []), [session]);
  const supersetBorders = useMemo(() => {
    const colorByEntryId = buildSupersetColorMap(supersetRuns, supersetPalette);
    const map = new Map<string, SupersetBorder>();
    for (const run of supersetRuns) {
      run.entryIds.forEach((entryId, index) => {
        const color = colorByEntryId.get(entryId);
        if (color != null) {
          map.set(entryId, { color, isLast: index === run.entryIds.length - 1 });
        }
      });
    }
    return map;
  }, [supersetRuns, supersetPalette]);

  // Expanded state: the cursor's exercise auto-expands as the workout
  // advances, auto-collapsing only the previously auto-expanded card — cards
  // the user opened by hand stay open.
  const [userExpandedIds, setUserExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [autoExpandedId, setAutoExpandedId] = useState<string | null>(activeExerciseId);
  const [focusedExerciseId, setFocusedExerciseId] = useState<string | null>(activeExerciseId);

  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  const cardOffsetsRef = useRef<Record<string, number>>({});
  const viewportHeightRef = useRef(0);
  const programmaticScrollUntilRef = useRef(0);

  const scrollToExercise = useCallback((entryId: string) => {
    const y = cardOffsetsRef.current[entryId];
    if (y == null) return;
    programmaticScrollUntilRef.current = Date.now() + 600;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  }, []);

  // Follow the cursor: when the active exercise changes, adopt it as the
  // auto-expanded/focused card. Render-time state adjust (not an effect) so
  // the expansion lands in the same commit as the cursor move.
  const [prevActiveExerciseId, setPrevActiveExerciseId] = useState(activeExerciseId);
  if (activeExerciseId !== prevActiveExerciseId) {
    setPrevActiveExerciseId(activeExerciseId);
    if (activeExerciseId != null) {
      setAutoExpandedId(activeExerciseId);
      setFocusedExerciseId(activeExerciseId);
    }
  }

  useEffect(() => {
    if (activeExerciseId == null) return;
    // Defer so the newly expanded card has a measured offset before scrolling.
    const id = setTimeout(() => scrollToExercise(activeExerciseId), 350);
    return () => clearTimeout(id);
  }, [activeExerciseId, scrollToExercise]);

  const handleToggleExpanded = useCallback(
    (entryId: string) => {
      setUserExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(entryId)) {
          next.delete(entryId);
        } else if (autoExpandedId === entryId) {
          // Collapsing the auto-expanded card.
          setAutoExpandedId(null);
        } else {
          next.add(entryId);
        }
        return next;
      });
    },
    [autoExpandedId],
  );

  const handleRailPress = useCallback(
    (entryId: string) => {
      setUserExpandedIds((prev) => {
        if (prev.has(entryId) || autoExpandedId === entryId) return prev;
        const next = new Set(prev);
        next.add(entryId);
        return next;
      });
      setFocusedExerciseId(entryId);
      setTimeout(() => scrollToExercise(entryId), 100);
    },
    [autoExpandedId, scrollToExercise],
  );

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Date.now() < programmaticScrollUntilRef.current) return;
    const offset = event.nativeEvent.contentOffset.y;
    const probe = offset + viewportHeightRef.current / 3;
    let candidate: string | null = null;
    let candidateY = -Infinity;
    for (const [entryId, y] of Object.entries(cardOffsetsRef.current)) {
      if (y <= probe && y > candidateY) {
        candidate = entryId;
        candidateY = y;
      }
    }
    if (candidate != null) setFocusedExerciseId(candidate);
  }, []);

  // Add-exercise return from ExerciseSearch.
  useSelectedExercise(route.params, (exercise) => {
    useActiveWorkoutStore.getState().addExercise(exercise);
  });

  const handleAddExercise = useCallback(() => {
    runNavigationAction(() => {
      navigation.navigate('ExerciseSearch', { returnKey: route.key });
    });
  }, [navigation, route.key, runNavigationAction]);

  // Rest sheet (per-exercise rest duration).
  const restSheetRef = useRef<RestPeriodSheetRef>(null);
  const restSheetEntryIdRef = useRef<string | null>(null);
  const handlePressRestChip = useCallback((entryId: string, currentSec: number | null) => {
    restSheetEntryIdRef.current = entryId;
    restSheetRef.current?.present(currentSec);
  }, []);
  const handleRestChanged = useCallback((seconds: number) => {
    const entryId = restSheetEntryIdRef.current;
    if (entryId != null) {
      useActiveWorkoutStore.getState().setExerciseRest(entryId, seconds);
    }
  }, []);

  // Metric column picker.
  const [metricMenuAnchor, setMetricMenuAnchor] = useState<AnchorRect | null>(null);
  const handlePressMetricHeader = useCallback((anchor: AnchorRect) => {
    setMetricMenuAnchor(anchor);
  }, []);

  // Card ⋮ menu. 'main' offers the superset actions; 'pick' swaps in the
  // candidate list (ungrouped exercises other than the current one) at the
  // same anchor.
  const [overflowMenu, setOverflowMenu] = useState<{
    entryId: string;
    anchor: AnchorRect;
    mode: 'main' | 'pick';
  } | null>(null);
  const handlePressOverflow = useCallback(
    (entryId: string, anchor: AnchorRect) => {
      setOverflowMenu({ entryId, anchor, mode: 'main' });
    },
    [],
  );

  const overflowMenuItems = useMemo(() => {
    if (overflowMenu == null || session == null) return [];
    const { entryId, mode } = overflowMenu;
    const groupedIds = new Set(supersetRuns.flatMap((run) => run.entryIds));
    const candidates = session.exercises.filter(
      (e) => e.id !== entryId && !groupedIds.has(e.id),
    );

    if (mode === 'pick') {
      return candidates.map((candidate) => ({
        key: candidate.id,
        label: candidate.exercise_snapshot?.name ?? 'Exercise',
        onPress: () => {
          useActiveWorkoutStore.getState().supersetWith(entryId, candidate.id);
        },
      }));
    }

    const items: { key: string; label: string; onPress: () => void }[] = [];
    if (candidates.length > 0) {
      items.push({
        key: 'superset-with',
        label: 'Superset with…',
        onPress: () => {
          // Re-open at the same anchor with the candidate list. AnchoredMenu
          // closes first (onClose), then this runs — both land in one commit.
          setOverflowMenu({ ...overflowMenu, mode: 'pick' });
        },
      });
    }
    if (groupedIds.has(entryId)) {
      items.push({
        key: 'ungroup',
        label: 'Remove from superset',
        onPress: () => {
          useActiveWorkoutStore.getState().ungroupExercise(entryId);
        },
      });
    }
    return items;
  }, [overflowMenu, session, supersetRuns]);

  const handleCompleteActive = useCallback(() => {
    useActiveWorkoutStore.getState().completeActiveSet();
  }, []);
  const handleUncomplete = useCallback((setId: string) => {
    useActiveWorkoutStore.getState().uncompleteSet(setId);
  }, []);
  const handleRecomplete = useCallback((setId: string) => {
    useActiveWorkoutStore.getState().recompleteSet(setId);
  }, []);
  const handleCommitField = useCallback((setId: string, patch: ActiveSetPatch) => {
    useActiveWorkoutStore.getState().updateSetField(setId, patch);
  }, []);
  const handleAddSet = useCallback((entryId: string) => {
    useActiveWorkoutStore.getState().addSetToExercise(entryId);
  }, []);

  const handleDeleteSet = useCallback((setId: string) => {
    const store = useActiveWorkoutStore.getState();
    const exercise = store.session?.exercises.find((e) =>
      e.sets.some((s) => String(s.id) === setId),
    );
    if (exercise != null && exercise.sets.length <= 1) {
      const name = exercise.exercise_snapshot?.name ?? 'this exercise';
      Alert.alert(
        'Remove exercise?',
        `Deleting the only set removes ${name} from this workout.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => useActiveWorkoutStore.getState().deleteSet(setId),
          },
        ],
      );
      return;
    }
    store.deleteSet(setId);
  }, []);

  const handleLongPressSet = useCallback((setId: string) => {
    const store = useActiveWorkoutStore.getState();
    const exercise = store.session?.exercises.find((e) =>
      e.sets.some((s) => String(s.id) === setId),
    );
    const set = exercise?.sets.find((s) => String(s.id) === setId);
    if (!exercise || !set) return;

    const currentType = set.set_type ?? 'normal';
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] =
      SET_TYPE_OPTIONS.map((type) => ({
        text: `${type === currentType ? '✓ ' : ''}${type.charAt(0).toUpperCase()}${type.slice(1)}`,
        onPress: () => useActiveWorkoutStore.getState().updateSetField(setId, { set_type: type }),
      }));

    const targetIndex = store.steps.findIndex((s) => s.setId === setId);
    const activeIndex =
      store.activeSetId == null
        ? -1
        : store.steps.findIndex((s) => s.setId === store.activeSetId);
    if (activeIndex >= 0 && targetIndex > activeIndex) {
      buttons.push({
        text: 'Jump here',
        onPress: () => useActiveWorkoutStore.getState().jumpToSet(setId),
      });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });

    const name = exercise.exercise_snapshot?.name ?? 'Exercise';
    Alert.alert(`${name} · Set ${set.set_number}`, 'Set type', buttons);
  }, []);

  const handleDiscard = useCallback(() => {
    // Live-start sessions exist on the server only because the user hit Start,
    // so discarding deletes them instead of leaving a stray diary workout.
    // Sessions started from WorkoutDetail keep their keep-server-edits discard.
    if (createdByLiveStart && sessionId != null) {
      const idToDelete = sessionId;
      // entry_date can round-trip as an ISO timestamp; un-normalized it would
      // silently miss the daily-summary cache key on invalidation.
      const entryDate = session?.entry_date != null ? normalizeDate(session.entry_date) : null;
      Alert.alert('Discard workout?', 'This deletes the workout from your diary.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            // Clear and exit first: clearing cancels the pending autosave
            // debounce and frees the user immediately; the delete finishes in
            // the background (a racing autosave 404s harmlessly server-side).
            useActiveWorkoutStore.getState().clearWorkout();
            navigation.goBack();
            deleteWorkout(idToDelete)
              .then(() => {
                if (entryDate != null) invalidateExerciseCache(queryClient, entryDate);
              })
              .catch((error: unknown) => {
                addLog(`Failed to delete discarded live-start workout: ${error}`, 'ERROR');
                Toast.show({
                  type: 'error',
                  text1: "Couldn't delete workout",
                  text2: 'It remains in your diary.',
                });
              });
          },
        },
      ]);
      return;
    }

    Alert.alert(
      'Discard workout?',
      'Clears your progress on this device and drops unsaved changes. Edits already saved to the server are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            useActiveWorkoutStore.getState().clearWorkout();
            navigation.goBack();
          },
        },
      ],
    );
  }, [createdByLiveStart, sessionId, session, queryClient, navigation]);

  const handleFinish = useCallback(async () => {
    // Named so the failure alert's Retry can re-run the same attempt.
    async function attempt(): Promise<void> {
      const ok = await flush();
      if (!ok) {
        Alert.alert(
          'Could not save your workout',
          'Some changes have not reached the server yet.',
          [
            { text: 'Retry', onPress: () => void attempt() },
            {
              text: 'Discard changes',
              style: 'destructive',
              onPress: () => {
                useActiveWorkoutStore.getState().clearWorkout();
                navigation.goBack();
              },
            },
            { text: 'Cancel', style: 'cancel' },
          ],
        );
        return;
      }
      useActiveWorkoutStore.getState().clearWorkout();
      navigation.goBack();
    }
    await attempt();
  }, [flush, navigation]);

  if (session == null || sessionId == null) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-base text-text-muted">No active workout</Text>
      </View>
    );
  }

  const progress = buildExerciseProgress(session, completedSetIds);

  const restVisible = restState !== 'ready';
  const restRemainingMs = (() => {
    if (restState === 'resting' && restEndsAt != null) {
      return Math.max(0, restEndsAt - now);
    }
    if (restState === 'paused' && restPausedRemainingMs != null) {
      return restPausedRemainingMs;
    }
    return 0;
  })();
  const restLabel = (() => {
    if (activeSetId == null) return '';
    for (const exercise of session.exercises) {
      const set = exercise.sets.find((s) => String(s.id) === activeSetId);
      if (set) {
        return `${exercise.exercise_snapshot?.name ?? 'Exercise'} · Set ${set.set_number}`;
      }
    }
    return '';
  })();

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ActiveWorkoutHeader
        name={session.name}
        startedAt={startedAt}
        now={now}
        progress={progress}
        onBack={() => navigation.goBack()}
        onDiscard={handleDiscard}
      />

      <ActiveWorkoutRail
        exercises={session.exercises}
        completedSetIds={completedSetIds}
        focusedEntryId={focusedExerciseId}
        supersetBorders={supersetBorders}
        getImageSource={getImageSource}
        onPressExercise={handleRailPress}
        onPressAdd={handleAddExercise}
      />

      <KeyboardAwareScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="px-3 pt-2"
        contentContainerStyle={{ paddingBottom: restVisible ? 16 : insets.bottom + 16 }}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        onLayout={(e) => {
          viewportHeightRef.current = e.nativeEvent.layout.height;
        }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={80}
      >
        {session.exercises.map((exercise) => {
          const isExpanded =
            userExpandedIds.has(exercise.id) || autoExpandedId === exercise.id;
          const supersetBorder = supersetBorders.get(exercise.id) ?? null;
          const card = (
            <ActiveWorkoutExerciseCard
              exercise={exercise}
              expanded={isExpanded}
              completedSetIds={completedSetIds}
              activeSetId={activeSetId}
              metricColumn={metricColumn}
              weightUnit={weightUnit}
              getImageSource={getImageSource}
              onToggleExpanded={handleToggleExpanded}
              onPressRestChip={handlePressRestChip}
              onPressMetricHeader={handlePressMetricHeader}
              onPressOverflow={handlePressOverflow}
              onCompleteActive={handleCompleteActive}
              onUncomplete={handleUncomplete}
              onRecomplete={handleRecomplete}
              onCommitField={handleCommitField}
              onDeleteSet={handleDeleteSet}
              onLongPressSet={handleLongPressSet}
              onAddSet={handleAddSet}
            />
          );

          return (
            <Animated.View
              key={exercise.id}
              layout={LinearTransition.duration(300)}
              onLayout={(e) => {
                cardOffsetsRef.current[exercise.id] = e.nativeEvent.layout.y;
              }}
            >
              {supersetBorder ? (
                // Grouped members carry a flat 3px left rail. Interior rails
                // run to the wrapper's bottom — which includes the expanded
                // card's 8px mb-2 — so consecutive members read as one
                // continuous line; the run's last member stops at the card.
                <View style={{ paddingLeft: 10 }}>
                  <View
                    testID={`superset-rail-${exercise.id}`}
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
                  {card}
                </View>
              ) : (
                card
              )}
            </Animated.View>
          );
        })}

        <Button
          variant="primary"
          onPress={() => void handleFinish()}
          className="mt-6 mb-2 mx-1"
        >
          End Workout
        </Button>
      </KeyboardAwareScrollView>

      {restVisible && (
        <ActiveWorkoutRestBar
          remainingMs={restRemainingMs}
          durationSec={restDurationSec}
          paused={restState === 'paused'}
          label={restLabel}
          onAdjust={(deltaSec) => useActiveWorkoutStore.getState().adjustRest(deltaSec)}
          onSkip={() => useActiveWorkoutStore.getState().dismissRest()}
        />
      )}

      <RestPeriodSheet ref={restSheetRef} onChange={handleRestChanged} />

      <AnchoredMenu
        visible={metricMenuAnchor != null}
        anchor={metricMenuAnchor}
        onClose={() => setMetricMenuAnchor(null)}
        minWidth={160}
        items={METRIC_OPTIONS.map((option) => ({
          key: option,
          label:
            option === metricColumn
              ? `✓ ${METRIC_MENU_LABELS[option]}`
              : METRIC_MENU_LABELS[option],
          onPress: () => setMetricColumn(option),
        }))}
      />

      <AnchoredMenu
        visible={overflowMenu != null && overflowMenuItems.length > 0}
        anchor={overflowMenu?.anchor ?? null}
        onClose={() => setOverflowMenu(null)}
        minWidth={200}
        items={overflowMenuItems}
      />
    </View>
  );
}

export default ActiveWorkoutScreen;
