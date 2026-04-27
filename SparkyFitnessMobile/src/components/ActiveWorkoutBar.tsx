import React, { useEffect, useMemo, useState } from 'react';
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
const EMBEDDED_FAB_CLEARANCE = 8;

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
  'MeasurementsAdd',
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

  // Active-set details (exercise name, set number, weight × reps) looked up
  // against the session snapshot since `steps` only holds name/restSec.
  // Split into discrete fields so the rendering can stack "status: name -
  // set N/M" on one row and the load ("135 lbs × 8") on a second row.
  const activeSetLabel = useMemo(() => {
    if (activeSession == null || activeSetId == null) return null;
    for (const exercise of activeSession.exercises) {
      const set = exercise.sets.find((st) => String(st.id) === activeSetId);
      if (!set) continue;
      const exerciseName = exercise.exercise_snapshot?.name ?? 'Exercise';
      const setNumber = `Set ${set.set_number}/${exercise.sets.length}`;
      let loadText = '';
      if (set.weight != null && set.reps != null) {
        const w = parseFloat(weightFromKg(set.weight, weightUnit).toFixed(1));
        loadText = `${w} ${weightUnit} × ${set.reps}`;
      } else if (set.reps != null) {
        loadText = `${set.reps} reps`;
      } else if (set.weight != null) {
        const w = parseFloat(weightFromKg(set.weight, weightUnit).toFixed(1));
        loadText = `${w} ${weightUnit}`;
      }
      return { exerciseName, setNumber, loadText };
    }
    return null;
  }, [activeSession, activeSetId, weightUnit]);

  // The bar is a persistent workout HUD — visible for the entire active
  // workout, not just while a rest timer is running.
  if (sessionId == null) return null;
  if (navInfo.suppressed) return null;
  // The embedded variant lives inside the tab bar's layout and is always on
  // the Tabs route when rendered. The floating variant is an overlay for
  // stack screens, so it must hide itself while the tab bar (and embedded
  // variant) is showing to avoid a double-bar.
  if (variant === 'floating' && navInfo.isOnTabs) return null;

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

  // Resting / paused use a three-row layout: a top status label ("Resting"
  // / "Paused"), a middle "Next: exercise - set N/M", and a load line. Other
  // states collapse to two rows — "Next Up: ..." or "Workout complete" on
  // top, load (or empty) underneath.
  const isResting = restState === 'resting' || restState === 'paused';
  const topStatusLine =
    restState === 'resting'
      ? 'Resting'
      : restState === 'paused'
        ? 'Paused'
        : null;
  const primaryLine = (() => {
    if (isWorkoutComplete) return 'Workout complete';
    if (!activeSetLabel) return 'Workout active';
    const prefix = isResting ? 'Next' : 'Next Up';
    return `${prefix}: ${activeSetLabel.exerciseName} - ${activeSetLabel.setNumber}`;
  })();
  const secondaryLine = isWorkoutComplete
    ? ''
    : (activeSetLabel?.loadText ?? '');

  // Right-aligned countdown — only rendered while a rest timer is running.
  const countdownLabel =
    restState === 'resting' ? formatCountdown(displaySeconds) : null;

  // Left button:
  //  - resting → Pause (pauses the rest timer)
  //  - ready / paused / complete → X (clear workout)
  const leftButton =
    restState === 'resting' ? (
      <Pressable
        onPress={handlePausePlay}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Pause"
        className="p-2"
      >
        <Icon name="pause" size={22} color={accentPrimary} weight="bold" />
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
  //  - ready  → Play (complete the active set, advance + start rest)
  //  - resting → Check (skip rest / mark next ready)
  //  - paused → Play (resume the rest timer)
  //  - complete → hidden; the X on the left is the only way out
  const rightButton = (() => {
    if (isWorkoutComplete) return null;
    if (restState === 'resting') {
      return (
        <Pressable
          onPress={handleSkipRest}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Skip rest"
          // Filled accent pill so the "complete set" affordance pops against
          // the muted pause icon on the left and the countdown digits.
          className="h-9 w-9 items-center justify-center rounded-full border-2 border-accent-primary"
        >
          <Icon name="checkmark" size={20} color={accentPrimary} weight="bold" />
        </Pressable>
      );
    }
    if (restState === 'paused') {
      return (
        <Pressable
          onPress={handlePausePlay}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Resume"
          className="p-2"
        >
          <Icon name="play" size={22} color={accentPrimary} weight="bold" />
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
  //
  // We use `minHeight` (not a fixed `height`) so the bar can grow vertically
  // when the bottom details line wraps to two lines — e.g. small phones in
  // the resting state where the countdown eats horizontal room. The inner row
  // is intrinsically sized (no `flex-1`), so its py padding drives the
  // non-wrapped height while wrapping just pushes it taller.
  const isEmbedded = variant === 'embedded';
  const barBody = (
    <View
      className="bg-chrome border-t border-chrome-border"
      style={{
        minHeight: isEmbedded
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

      {/* Primary row — left control, stacked top/bottom text, right control.
          Intrinsically sized so the bar grows when the bottom line wraps. */}
      <View className="flex-row items-center px-2 py-2">
        <View className="w-11 items-center">{leftButton}</View>

        <Pressable
          onPress={handleCenterTap}
          className="flex-1 justify-center px-1"
          accessibilityRole="button"
          accessibilityLabel="Open active workout"
        >
          {topStatusLine != null && (
            <Text
              numberOfLines={1}
              className="text-base font-semibold text-text-primary"
            >
              {topStatusLine}
            </Text>
          )}
          <Text
            numberOfLines={1}
            className={
              topStatusLine != null
                ? 'text-sm text-text-primary'
                : 'text-base font-semibold text-text-primary'
            }
          >
            {primaryLine}
          </Text>
          <Text numberOfLines={1} className="text-sm text-text-secondary">
            {secondaryLine}
          </Text>
        </Pressable>

        {countdownLabel != null && (
          <Text
            className="px-2 text-xl font-bold text-text-primary"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {countdownLabel}
          </Text>
        )}

        <View className="w-11 items-center">{rightButton}</View>
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
