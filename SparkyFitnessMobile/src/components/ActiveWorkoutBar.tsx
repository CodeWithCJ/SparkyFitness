import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import {
  createNavigationContainerRef,
  type NavigationState,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import Icon from './Icon';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { usePreferences } from '../hooks/usePreferences';
import { weightFromKg } from '../utils/unitConversions';
import type { RootStackParamList } from '../types/navigation';

/**
 * Shared navigation ref — must be passed to the app's `<NavigationContainer ref={...} />`.
 * The floating `ActiveWorkoutBar` renders as a sibling of the root navigator (not inside
 * a screen), so it can't use the `useNavigation` / `useNavigationState` hooks. Instead
 * we subscribe to the container's state through this ref.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const BAR_CONTENT_HEIGHT = 76;

/**
 * Bottom padding applied to the embedded variant so the floating Add button
 * (which rises ~20pt above the tab bar's top edge) overlaps an empty strip
 * instead of the bar's content. Cheaper than reserving a full-width center
 * gap — content flows edge to edge and only the bottom ~20pt is "dead zone".
 */
const EMBEDDED_FAB_CLEARANCE = 20;

export const ACTIVE_WORKOUT_BAR_HEIGHT = BAR_CONTENT_HEIGHT + EMBEDDED_FAB_CLEARANCE;

/**
 * Extra bottom padding screens should reserve when the active workout bar is
 * visible.
 * - Tab screens ('tabs'): embedded variant sits above the tab bar and includes
 *   the FAB clearance, so scroll content must clear the full embedded height.
 * - Stack screens ('stack'): floating variant is an overlay pinned to the
 *   bottom safe area with no FAB underneath, so only the raw content height
 *   needs to be cleared.
 */
export function useActiveWorkoutBarPadding(
  context: 'tabs' | 'stack' = 'tabs',
): number {
  const active = useActiveWorkoutStore((s) => s.sessionId !== null);
  if (!active) return 0;
  return context === 'tabs' ? ACTIVE_WORKOUT_BAR_HEIGHT : BAR_CONTENT_HEIGHT;
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

interface ActiveWorkoutBarProps {
  /**
   * - `embedded` — renders inline with no absolute positioning, intended to sit
   *   directly above the tab bar inside the navigator's `tabBar` slot. The row
   *   layout leaves a center gap so the floating Add button can visually
   *   overlap the bar without colliding with its content.
   * - `floating` — renders as an absolute-positioned overlay pinned to the
   *   bottom safe-area inset. Used for stack screens where the tab bar (and
   *   therefore the embedded bar) is not visible.
   */
  variant?: 'embedded' | 'floating';
}

const ActiveWorkoutBar: React.FC<ActiveWorkoutBarProps> = ({
  variant = 'floating',
}) => {
  const sessionId = useActiveWorkoutStore((s) => s.sessionId);
  const activeSession = useActiveWorkoutStore((s) => s.session);
  const activeSetId = useActiveWorkoutStore((s) => s.activeSetId);
  const restState = useActiveWorkoutStore((s) => s.rest.state);
  const endsAt = useActiveWorkoutStore((s) => s.rest.endsAt);
  const pausedRemainingMs = useActiveWorkoutStore((s) => s.rest.pausedRemainingMs);
  const durationSec = useActiveWorkoutStore((s) => s.rest.durationSec);
  // Exercise name for the active set — what the user is about to do (or
  // resting before). Null when the workout has finished (activeSetId == null).
  const activeExerciseName = useActiveWorkoutStore((s) => {
    if (s.activeSetId == null) return null;
    return (
      s.steps.find((step) => step.setId === s.activeSetId)?.exerciseName ?? null
    );
  });

  const { preferences } = usePreferences();
  const weightUnit = (preferences?.default_weight_unit ?? 'kg') as 'kg' | 'lbs';

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

  // Only kept as JS strings because `Icon` takes a `color` prop (not className),
  // and the outer floating wrapper needs a matching solid background underneath
  // the home-indicator safe-area inset. All other theme colors flow through
  // className (`bg-chrome`, `text-text-primary`, etc.) so styling stays in
  // tailwind and tracks theme changes automatically.
  const [accentPrimary, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

  // Tick while resting so the countdown redraws each second. We use a bare
  // tick counter (not a cached `Date.now()`) to force re-renders — the actual
  // "now" used in calculations is read fresh at render time below. Caching it
  // in state would make the first render after going ready → resting show a
  // stale value (the countdown would briefly read too high).
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (restState !== 'resting') return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [restState]);

  // Transition resting → ready when the deadline passes.
  useEffect(() => {
    if (restState === 'resting' && endsAt != null && Date.now() >= endsAt) {
      useActiveWorkoutStore.getState().markRestReady();
    }
  }, [restState, endsAt, tick]);

  const isWorkoutComplete = sessionId != null && activeSetId == null;

  // The bar is a persistent workout HUD — visible for the entire active
  // workout, not just while a rest timer is running.
  if (sessionId == null) return null;
  if (navInfo.suppressed) return null;
  // The embedded variant lives inside the tab bar's layout and is always on
  // the Tabs route when rendered. The floating variant is an overlay for
  // stack screens, so it must hide itself while the tab bar (and embedded
  // variant) is showing to avoid a double-bar.
  if (variant === 'floating' && navInfo.isOnTabs) return null;

  // "Up next" line — details (set number + weight × reps) for the active
  // set. Shown below the primary row so the user can see what they're about
  // to do without reopening WorkoutDetail. Looked up against the active
  // session snapshot since `steps` only holds name/restSec.
  const activeSetLabel = (() => {
    if (activeSession == null || activeSetId == null) return null;
    for (const exercise of activeSession.exercises) {
      const set = exercise.sets.find((st) => String(st.id) === activeSetId);
      if (!set) continue;
      const exerciseName = exercise.exercise_snapshot?.name ?? 'Exercise';
      const bits: string[] = [`Set ${set.set_number}/${exercise.sets.length}`];
      if (set.weight != null && set.reps != null) {
        const w = parseFloat(weightFromKg(set.weight, weightUnit).toFixed(1));
        bits.push(`${w} ${weightUnit} × ${set.reps}`);
      } else if (set.reps != null) {
        bits.push(`${set.reps} reps`);
      } else if (set.weight != null) {
        const w = parseFloat(weightFromKg(set.weight, weightUnit).toFixed(1));
        bits.push(`${w} ${weightUnit}`);
      }
      return { exerciseName, details: bits.join(' · ') };
    }
    return null;
  })();

  const remainingMs = (() => {
    if (restState === 'resting' && endsAt != null) {
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

  const handlePausePlay = () => {
    if (restState === 'resting') {
      useActiveWorkoutStore.getState().pauseRest();
    } else if (restState === 'paused') {
      useActiveWorkoutStore.getState().resumeRest();
    }
  };

  // Skip the current rest — clears to 'ready' without advancing the cursor.
  const handleSkipRest = () => {
    useActiveWorkoutStore.getState().dismissRest();
  };

  // Complete the active set and advance. Bar-only shortcut so the user can
  // rep without flipping back to WorkoutDetail.
  const handleDoneSet = () => {
    useActiveWorkoutStore.getState().completeActiveSet();
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

  // Status / timer label on the right side of the primary row. When the
  // workout is finished, the cursor is null and we show "Complete" until the
  // user taps X to clear.
  const statusLabel = (() => {
    if (isWorkoutComplete) return 'Complete';
    if (restState === 'resting') return formatCountdown(displaySeconds);
    if (restState === 'paused') return 'Paused';
    return 'Ready';
  })();
  // Exercise name label — the exercise the user is currently on (or resting
  // before). Empty when the workout is finished.
  const exerciseLabel = isWorkoutComplete
    ? 'Workout complete'
    : activeExerciseName ?? 'Workout active';

  // "Up next" single-line summary for the active set.
  const upNextText =
    !isWorkoutComplete && activeSetLabel
      ? `${activeSetLabel.exerciseName} · ${activeSetLabel.details}`
      : '';

  // Left button: pause/play while a rest timer exists, X to clear the
  // workout when ready (no timer running) or finished.
  const leftButton =
    restState === 'resting' || restState === 'paused' ? (
      <Pressable
        onPress={handlePausePlay}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={restState === 'resting' ? 'Pause' : 'Resume'}
        className="p-2"
      >
        <Icon
          name={restState === 'resting' ? 'pause' : 'play'}
          size={22}
          color={accentPrimary}
          weight="bold"
        />
      </Pressable>
    ) : (
      <Pressable
        onPress={handleClear}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Clear workout"
        className="p-2"
      >
        <Icon name="close" size={22} color={textMuted} weight="bold" />
      </Pressable>
    );

  // Right button:
  //  - ready  → Done (complete the active set, advance + start rest)
  //  - resting → Skip rest
  //  - paused → X (clear workout, since pause already implies "I'm handling this manually")
  //  - complete (workout finished) → hidden; the X on the left is the only way out
  const rightButton = (() => {
    if (isWorkoutComplete) return null;
    if (restState === 'resting') {
      return (
        <Pressable
          onPress={handleSkipRest}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Skip rest"
          className="p-2"
        >
          <Icon name="checkmark" size={22} color={accentPrimary} weight="bold" />
        </Pressable>
      );
    }
    if (restState === 'paused') {
      return (
        <Pressable
          onPress={handleClear}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Clear workout"
          className="p-2"
        >
          <Icon name="close" size={22} color={textMuted} weight="bold" />
        </Pressable>
      );
    }
    return (
      <Pressable
        onPress={handleDoneSet}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Done — start next set"
        className="p-2"
      >
        <Icon name="play" size={22} color={accentPrimary} weight="bold" />
      </Pressable>
    );
  })();

  // Embedded mode adds bottom padding so the floating Add button (which rises
  // ~20pt above the tab bar top edge) overlaps an empty strip at the bottom
  // of the bar instead of covering content. Floating mode is on stack screens
  // where there's no FAB, so no clearance is needed.
  const isEmbedded = variant === 'embedded';
  const barBody = (
    <View
      className="bg-chrome border-t border-chrome-border"
      style={{
        height: isEmbedded
          ? BAR_CONTENT_HEIGHT + EMBEDDED_FAB_CLEARANCE
          : BAR_CONTENT_HEIGHT,
        paddingBottom: isEmbedded ? EMBEDDED_FAB_CLEARANCE : 0,
      }}
    >
      {/* Progress bar — 3px along top edge. Width is the only dynamic value;
          track + fill colors flow through className. */}
      <View className="h-[3px] bg-progress-track">
        <View
          className="h-[3px] bg-accent-primary"
          style={{ width: `${progress * 100}%` }}
        />
      </View>

      <View className="flex-1 flex-col">
        {/* Line 1 — primary row: left control, exercise name, timer/status, right control */}
        <View className="flex-1 flex-row items-center px-2">
          <View className="w-11 items-center">{leftButton}</View>

          <Pressable
            onPress={handleCenterTap}
            className="flex-1 justify-center pl-1 pr-2"
            accessibilityRole="button"
            accessibilityLabel="Open active workout"
          >
            <Text
              numberOfLines={1}
              className="text-base font-semibold text-text-primary"
            >
              {exerciseLabel}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleCenterTap}
            className="justify-center pr-1"
            accessibilityRole="button"
            accessibilityLabel="Open active workout"
          >
            <Text
              numberOfLines={1}
              className="text-base font-semibold text-text-primary"
            >
              {statusLabel}
            </Text>
          </Pressable>

          <View className="w-11 items-center">{rightButton}</View>
        </View>

        {/* Line 2 — "Up next" row: muted single-line summary of the next
            pending set so the user knows what's coming without reopening
            WorkoutDetail. Indented past the left/right control columns. */}
        <Pressable
          onPress={handleCenterTap}
          accessibilityRole="button"
          accessibilityLabel="Open active workout"
          className="h-[22px] flex-row items-center px-2 pb-0.5"
        >
          <View className="w-11" />
          <View className="flex-1 pl-1 pr-1">
            <Text
              numberOfLines={1}
              className="text-sm text-text-secondary"
            >
              {upNextText}
            </Text>
          </View>
          <View className="w-11" />
        </Pressable>
      </View>
    </View>
  );

  if (variant === 'embedded') {
    // Rendered inside the navigator's `tabBar` slot — no absolute positioning
    // needed; the tab bar wrapper stacks this above CustomTabBar in a column.
    return barBody;
  }

  // Floating variant — overlay pinned to the physical bottom of the screen.
  // Only reached when the tab bar (and embedded variant) isn't visible. We
  // extend the chrome background down through the home-indicator safe area
  // so the dark window background doesn't peek through beneath the bar.
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-0 z-50 bg-chrome"
      style={{ paddingBottom: insets.bottom }}
    >
      {barBody}
    </View>
  );
};

export default ActiveWorkoutBar;
