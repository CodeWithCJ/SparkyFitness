import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import {
  createNavigationContainerRef,
  type NavigationState,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';

import Icon from './Icon';
import { TAB_BAR_HEIGHT, TAB_BAR_ADD_BUTTON_OVERFLOW } from './CustomTabBar';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import type { RootStackParamList } from '../types/navigation';

/**
 * Shared navigation ref — must be passed to the app's `<NavigationContainer ref={...} />`.
 * `ActiveWorkoutBar` renders as a sibling of the root navigator (not inside a screen),
 * so it can't use the `useNavigation` / `useNavigationState` hooks. Instead we subscribe
 * to the container's state through this ref.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export const ACTIVE_WORKOUT_BAR_HEIGHT = 56;
/**
 * Total vertical clearance the bar consumes when mounted above the tab bar.
 * Screens inside the tab navigator should use this (not the raw bar height)
 * for scroll padding, so the last row isn't covered by the bar or the Add
 * button that overflows above the tab bar's top edge.
 */
export const ACTIVE_WORKOUT_BAR_CLEARANCE =
  ACTIVE_WORKOUT_BAR_HEIGHT + TAB_BAR_ADD_BUTTON_OVERFLOW;

/**
 * Extra bottom padding screens should reserve when the active workout bar is
 * visible. Tab screens get the full clearance (bar + Add-button overflow);
 * stack screens only need the bar's height since they render without the tab
 * bar underneath.
 */
export function useActiveWorkoutBarPadding(
  context: 'tabs' | 'stack' = 'tabs',
): number {
  const active = useActiveWorkoutStore((s) => s.sessionId !== null);
  if (!active) return 0;
  return context === 'tabs' ? ACTIVE_WORKOUT_BAR_CLEARANCE : ACTIVE_WORKOUT_BAR_HEIGHT;
}

/**
 * Routes where the HUD should be hidden — either modal entry flows (food /
 * exercise search) or full-screen editors with their own sticky bottom
 * footers (WorkoutAdd, ActivityAdd) that would collide with the bar.
 */
const HIDDEN_ROUTES = new Set<string>([
  'FoodSearch',
  'FoodEntryAdd',
  'FoodForm',
  'FoodScan',
  'ExerciseSearch',
  'WorkoutAdd',
  'ActivityAdd',
]);

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

function computeNavInfo(state: NavigationState | undefined): {
  suppressed: boolean;
  isOnTabs: boolean;
} {
  if (!state) return { suppressed: false, isOnTabs: false };
  const name = state.routes[state.index]?.name ?? null;
  return {
    suppressed: name != null && HIDDEN_ROUTES.has(name),
    isOnTabs: name === 'Tabs',
  };
}

const ActiveWorkoutBar: React.FC = () => {
  const sessionId = useActiveWorkoutStore((s) => s.sessionId);
  const restState = useActiveWorkoutStore((s) => s.activeRest?.state ?? null);
  const endsAt = useActiveWorkoutStore((s) => s.activeRest?.endsAt ?? null);
  const pausedRemainingMs = useActiveWorkoutStore(
    (s) => s.activeRest?.pausedRemainingMs ?? null,
  );
  const durationSec = useActiveWorkoutStore((s) => s.activeRest?.durationSec ?? 0);
  // Exercise name for the currently-resting set (null when no rest is active).
  const restingExerciseName = useActiveWorkoutStore((s) => {
    const rest = s.activeRest;
    if (!rest) return null;
    return s.steps.find((step) => step.setId === rest.setId)?.exerciseName ?? null;
  });
  // The next uncompleted set — drives both the idle-state label and the
  // "Done" button that lets the user start the next rest without going back
  // to the workout detail screen.
  const nextPendingSetId = useActiveWorkoutStore((s) => {
    if (!s.sessionId) return null;
    const next = s.steps.find((step) => !s.completedSetIds[step.setId]);
    return next?.setId ?? null;
  });
  const nextPendingExerciseName = useActiveWorkoutStore((s) => {
    if (!s.sessionId) return null;
    const next = s.steps.find((step) => !s.completedSetIds[step.setId]);
    return next?.exerciseName ?? null;
  });

  const [navInfo, setNavInfo] = useState(() =>
    computeNavInfo(navigationRef.isReady() ? navigationRef.getRootState() : undefined),
  );

  useEffect(() => {
    const update = () => {
      if (!navigationRef.isReady()) return;
      const next = computeNavInfo(navigationRef.getRootState());
      setNavInfo((prev) =>
        prev.suppressed === next.suppressed && prev.isOnTabs === next.isOnTabs
          ? prev
          : next,
      );
    };
    update();
    const unsubscribe = navigationRef.addListener('state', update);
    return unsubscribe;
  }, []);

  const insets = useSafeAreaInsets();

  const [accentPrimary, chrome, chromeBorder, textPrimary, textMuted, progressTrack] =
    useCSSVariable([
      '--color-accent-primary',
      '--color-chrome',
      '--color-chrome-border',
      '--color-text-primary',
      '--color-text-muted',
      '--color-progress-track',
    ]) as [string, string, string, string, string, string];

  // Tick while running so the countdown redraws each second. We use a bare
  // tick counter (not a cached `Date.now()`) to force re-renders — the actual
  // "now" used in calculations is read fresh at render time below. Caching it
  // in state would make the first render after going idle → running show a
  // stale value (the countdown would briefly read too high).
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (restState !== 'running') return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [restState]);

  // Transition running → complete when the deadline passes.
  useEffect(() => {
    if (restState === 'running' && endsAt != null && Date.now() >= endsAt) {
      useActiveWorkoutStore.getState().markRestComplete();
    }
  }, [restState, endsAt, tick]);

  // The bar is a persistent workout HUD — visible for the entire active
  // workout, not just while a rest timer is running.
  if (sessionId == null) return null;
  if (navInfo.suppressed) return null;

  const isIdle = restState == null;
  // In idle state, show the next pending set's exercise; in running/paused/
  // complete state, show the set the rest is for.
  const displayExerciseName = isIdle
    ? nextPendingExerciseName
    : restingExerciseName;

  const remainingMs = (() => {
    if (restState === 'running' && endsAt != null) {
      // Read `Date.now()` fresh at render time — caching it in state would
      // briefly display a stale value on the first render after a new rest
      // starts (the `tick` state only advances via the 1s interval).
      return Math.max(0, endsAt - Date.now());
    }
    if (restState === 'paused' && pausedRemainingMs != null) return pausedRemainingMs;
    return 0;
  })();
  const displaySeconds = Math.ceil(remainingMs / 1000);
  const progress =
    durationSec > 0 ? Math.max(0, Math.min(1, remainingMs / (durationSec * 1000))) : 0;

  // When sitting above the tab bar we need to clear the floating Add button
  // that visually rises above the tab bar's top edge.
  const bottomOffset = navInfo.isOnTabs
    ? TAB_BAR_HEIGHT + TAB_BAR_ADD_BUTTON_OVERFLOW + insets.bottom
    : insets.bottom;

  const handlePausePlay = () => {
    if (restState === 'running') {
      useActiveWorkoutStore.getState().pauseRest();
    } else if (restState === 'paused') {
      useActiveWorkoutStore.getState().resumeRest();
    }
  };

  const handleNext = () => {
    const endedWorkout = useActiveWorkoutStore.getState().dismissRest();
    if (endedWorkout) {
      Toast.show({ type: 'success', text1: 'Workout complete' });
    }
  };

  // Mark the next pending set complete and start its rest timer. If every set
  // is already complete, fall back to dismissRest so the workout ends cleanly.
  const handleDoneSet = () => {
    if (nextPendingSetId != null) {
      useActiveWorkoutStore.getState().toggleSetComplete(nextPendingSetId);
      return;
    }
    const endedWorkout = useActiveWorkoutStore.getState().dismissRest();
    if (endedWorkout) {
      Toast.show({ type: 'success', text1: 'Workout complete' });
    }
  };

  const handleClear = () => {
    Alert.alert(
      'Clear workout?',
      'This will end the current workout without saving progress.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            useActiveWorkoutStore.getState().clearWorkout();
          },
        },
      ],
    );
  };

  const handleCenterTap = () => {
    // Read the session from the store rather than the history query cache —
    // the cache may not contain this session on a cold start or when the HUD
    // was started from a screen that hasn't warmed the history pages.
    const session = useActiveWorkoutStore.getState().session;
    if (!session) return;
    if (!navigationRef.isReady()) return;
    navigationRef.navigate('WorkoutDetail', { session });
  };

  const centerLabel = (() => {
    if (restState === 'running') return formatCountdown(displaySeconds);
    if (restState === 'paused') return 'Paused';
    if (restState === 'complete') return 'Complete';
    // Idle: workout active, no rest timer. Show the next exercise name as the
    // primary label so the user knows what's coming up.
    return displayExerciseName ?? 'Workout active';
  })();
  const centerTopLabel = !isIdle ? displayExerciseName : null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: bottomOffset,
        zIndex: 50,
      }}
    >
      <View
        style={{
          height: ACTIVE_WORKOUT_BAR_HEIGHT,
          backgroundColor: chrome,
          borderTopWidth: 1,
          borderTopColor: chromeBorder,
        }}
      >
        {/* Progress bar — 3px along top edge */}
        <View style={{ height: 3, backgroundColor: progressTrack }}>
          <View
            style={{
              height: 3,
              width: `${progress * 100}%`,
              backgroundColor: accentPrimary,
            }}
          />
        </View>

        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 8,
          }}
        >
          {/* Left button: Pause / Play (running or paused), Clear X (idle), hidden (complete) */}
          <View style={{ width: 44, alignItems: 'center' }}>
            {(restState === 'running' || restState === 'paused') && (
              <Pressable
                onPress={handlePausePlay}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={restState === 'running' ? 'Pause' : 'Resume'}
                style={{ padding: 8 }}
              >
                <Icon
                  name={restState === 'running' ? 'pause' : 'play'}
                  size={22}
                  color={accentPrimary}
                  weight="bold"
                />
              </Pressable>
            )}
            {isIdle && (
              <Pressable
                onPress={handleClear}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Clear workout"
                style={{ padding: 8 }}
              >
                <Icon name="close" size={22} color={textMuted} weight="bold" />
              </Pressable>
            )}
          </View>

          {/* Center: exercise name + countdown/status */}
          <Pressable
            onPress={handleCenterTap}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityLabel="Open active workout"
          >
            {centerTopLabel && (
              <Text
                numberOfLines={1}
                style={{ color: textMuted, fontSize: 11 }}
              >
                {centerTopLabel}
              </Text>
            )}
            <Text
              numberOfLines={1}
              style={{
                color: textPrimary,
                fontSize: 16,
                fontWeight: '600',
              }}
            >
              {centerLabel}
            </Text>
          </Pressable>

          {/* Right button: Done (idle/complete — marks next set & starts rest),
              Next (running — skips current rest), Clear (paused) */}
          <View style={{ width: 64, alignItems: 'flex-end' }}>
            {restState === 'paused' ? (
              <Pressable
                onPress={handleClear}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Clear workout"
                style={{ padding: 8 }}
              >
                <Text
                  style={{
                    color: accentPrimary,
                    fontSize: 14,
                    fontWeight: '600',
                  }}
                >
                  Clear
                </Text>
              </Pressable>
            ) : isIdle || restState === 'complete' ? (
              <Pressable
                onPress={handleDoneSet}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={
                  nextPendingSetId != null ? 'Done — start next set' : 'Finish workout'
                }
                style={{ padding: 8 }}
              >
                <Text
                  style={{
                    color: accentPrimary,
                    fontSize: 14,
                    fontWeight: '600',
                  }}
                >
                  Done
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={handleNext}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Skip rest"
                style={{ padding: 8 }}
              >
                <Text
                  style={{
                    color: accentPrimary,
                    fontSize: 14,
                    fontWeight: '600',
                  }}
                >
                  Next
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

export default ActiveWorkoutBar;
