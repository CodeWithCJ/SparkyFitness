import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { View, Text, Pressable, Alert } from 'react-native';
import {
  createNavigationContainerRef,
  type NavigationState,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import Icon from './Icon';
import { TAB_BAR_HEIGHT } from './CustomTabBar';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { flushActiveWorkoutBeforeClear } from '../hooks/useActiveWorkoutAutosave';
import { usePreferences } from '../hooks/usePreferences';
import { weightFromKg } from '../utils/unitConversions';
import { useNativeIOSTabsActive } from '../services/nativeTabBarPreference';
import type { RootStackParamList } from '../types/navigation';
import LiquidGlassSurface, {
  LIQUID_GLASS_VERTICAL_GAP,
  createLiquidGlassPillStyle,
} from './LiquidGlassSurface';
import { withAlpha } from '../utils/colors';

/**
 * Shared navigation ref — must be passed to the app's `<NavigationContainer ref={...} />`.
 * The floating `ActiveWorkoutBar` renders as a sibling of the root navigator (not inside
 * a screen), so it can't use the `useNavigation` / `useNavigationState` hooks. Instead
 * we subscribe to the container's state through this ref.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const BAR_CONTENT_HEIGHT = 60;
const PROGRESS_BAR_BOTTOM_OFFSET = 1;
const SLIDE_ANIMATION_DURATION_MS = 220;

/**
 * Bottom padding applied to the embedded variant so the floating Add button
 * (which rises ~20pt above the tab bar's top edge) overlaps an empty strip
 * instead of the bar's content. Cheaper than reserving a full-width center
 * gap — content flows edge to edge and only the bottom ~20pt is "dead zone".
 */
const EMBEDDED_FAB_CLEARANCE = 6;

type StackTransitionSnapshot = {
  phase: 'idle' | 'start' | 'end';
  closing: boolean;
  tick: number;
};

let stackTransitionSnapshot: StackTransitionSnapshot = {
  phase: 'idle',
  closing: false,
  tick: 0,
};

const stackTransitionListeners = new Set<
  (snapshot: StackTransitionSnapshot) => void
>();
const swipeProgressListeners = new Set<(progress: number) => void>();
let measuredTabBarHeight: number | null = null;
const tabBarHeightListeners = new Set<() => void>();

export function notifyActiveWorkoutBarStackTransition(
  phase: 'start' | 'end',
  closing: boolean,
) {
  stackTransitionSnapshot = {
    phase,
    closing,
    tick: stackTransitionSnapshot.tick + 1,
  };
  stackTransitionListeners.forEach(listener =>
    listener(stackTransitionSnapshot),
  );
}

export function notifyActiveWorkoutBarSwipeProgress(progress: number) {
  swipeProgressListeners.forEach(listener => listener(progress));
}

export function setActiveWorkoutBarTabBarHeight(height: number) {
  if (!Number.isFinite(height) || height <= 0) return;
  if (measuredTabBarHeight === height) return;
  measuredTabBarHeight = height;
  tabBarHeightListeners.forEach(listener => listener());
}

function subscribeToTabBarHeight(listener: () => void) {
  tabBarHeightListeners.add(listener);
  return () => {
    tabBarHeightListeners.delete(listener);
  };
}

function getTabBarHeightSnapshot() {
  return measuredTabBarHeight;
}

export const ACTIVE_WORKOUT_BAR_HEIGHT =
  BAR_CONTENT_HEIGHT + EMBEDDED_FAB_CLEARANCE + LIQUID_GLASS_VERTICAL_GAP;

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
  const active = useActiveWorkoutStore(s => s.sessionId !== null);
  if (!active) return 0;
  return context === 'tabs'
    ? ACTIVE_WORKOUT_BAR_HEIGHT
    : BAR_CONTENT_HEIGHT + LIQUID_GLASS_VERTICAL_GAP;
}

/**
 * Routes where the HUD should be hidden — either modal entry flows (food /
 * exercise search), full-screen editors with their own sticky bottom footers
 * (WorkoutAdd, ActivityAdd), the chat screen whose composer is pinned to the
 * bottom — all of which would collide with the bar — or the active-workout
 * screen itself, which is the surface the HUD opens.
 */
const HIDDEN_ROUTES = new Set<string>([
  'FoodSearch',
  'FoodEntryAdd',
  'FoodForm',
  'FoodScan',
  'FoodPhotoIntro',
  'FoodPhotoFlow',
  'EditBarcode',
  'ExerciseSearch',
  'WorkoutAdd',
  'ActivityAdd',
  'MeasurementsAdd',
  'Chat',
  'ActiveWorkout',
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
  tabsUnderTop: boolean;
} {
  if (!state) return { suppressed: false, isOnTabs: false, tabsUnderTop: false };
  const index = state.index ?? 0;
  const name = state.routes[index]?.name ?? null;
  const previousName = index > 0 ? state.routes[index - 1]?.name : null;
  return {
    suppressed: name != null && HIDDEN_ROUTES.has(name),
    isOnTabs: name === 'Tabs',
    tabsUnderTop: previousName === 'Tabs',
  };
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function interpolateBottomOffset(
  stackBottomOffset: number,
  tabBarBottomOffset: number,
  progress: number,
) {
  return (
    stackBottomOffset +
    (tabBarBottomOffset - stackBottomOffset) * clampProgress(progress)
  );
}

interface ActiveWorkoutBarProps {
  /**
   * Kept for compatibility with older call sites. The workout HUD is now
   * rendered once globally and moves between tab and stack positions.
   */
  variant?: 'embedded' | 'floating';
}

type LegacyWorkoutBarContentProps = {
  progress: number;
  leftButton: ReactNode;
  rightButton: ReactNode;
  onCenterPress: () => void;
  topStatusLine: string | null;
  primaryLine: string;
  secondaryLine: string;
  countdownLabel: string | null;
};

function LegacyWorkoutBarContent({
  progress,
  leftButton,
  rightButton,
  onCenterPress,
  topStatusLine,
  primaryLine,
  secondaryLine,
  countdownLabel,
}: LegacyWorkoutBarContentProps) {
  return (
    <>
      <View className="h-[3px] bg-progress-track">
        <View
          className="h-[3px] bg-accent-primary"
          style={{ width: `${progress * 100}%` }}
        />
      </View>

      <View className="flex-row items-center px-2 py-2">
        <View className="w-11 items-center">{leftButton}</View>

        <Pressable
          onPress={onCenterPress}
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
    </>
  );
}

const ActiveWorkoutBar: React.FC<ActiveWorkoutBarProps> = ({
  variant = 'floating',
}) => {
  const sessionId = useActiveWorkoutStore(s => s.sessionId);
  const activeSession = useActiveWorkoutStore(s => s.session);
  const activeSetId = useActiveWorkoutStore(s => s.activeSetId);
  const restState = useActiveWorkoutStore(s => s.rest.state);
  const endsAt = useActiveWorkoutStore(s => s.rest.endsAt);
  const pausedRemainingMs = useActiveWorkoutStore(
    s => s.rest.pausedRemainingMs,
  );
  const durationSec = useActiveWorkoutStore(s => s.rest.durationSec);
  const queryClient = useQueryClient();
  const { preferences } = usePreferences();
  const weightUnit = (preferences?.default_weight_unit ?? 'kg') as 'kg' | 'lbs';

  const [navInfo, setNavInfo] = useState(() =>
    computeNavInfo(
      navigationRef.isReady() ? navigationRef.getRootState() : undefined,
    ),
  );
  const [stackTransition, setStackTransition] = useState(
    stackTransitionSnapshot,
  );

  useEffect(() => {
    const update = () => {
      if (!navigationRef.isReady()) return;
      const next = computeNavInfo(navigationRef.getRootState());
      setNavInfo(prev =>
        prev.suppressed === next.suppressed &&
        prev.isOnTabs === next.isOnTabs &&
        prev.tabsUnderTop === next.tabsUnderTop
          ? prev
          : next,
      );
    };
    update();
    const unsubscribe = navigationRef.addListener('state', update);
    return unsubscribe;
  }, []);

  const insets = useSafeAreaInsets();
  const usesNativeTabs = useNativeIOSTabsActive();
  const nativeTabBarHeight = useSyncExternalStore(
    subscribeToTabBarHeight,
    getTabBarHeightSnapshot,
    getTabBarHeightSnapshot,
  );
  const tabBarBottomOffset =
    nativeTabBarHeight ?? TAB_BAR_HEIGHT + Math.max(insets.bottom, 4);
  const stackBottomOffset = insets.bottom;
  const isClosingToTabs =
    (stackTransition.phase === 'start' || stackTransition.phase === 'end') &&
    stackTransition.closing &&
    navInfo.tabsUnderTop;
  const shouldSitAboveTabs =
    usesNativeTabs && (isClosingToTabs || navInfo.isOnTabs);
  const bottomOffset = useSharedValue(
    shouldSitAboveTabs ? tabBarBottomOffset : stackBottomOffset,
  );
  const positionTrackingRef = useRef({
    stackBottomOffset,
    tabBarBottomOffset,
    tabsUnderTop: navInfo.tabsUnderTop,
    usesNativeTabs,
  });

  useEffect(() => {
    positionTrackingRef.current = {
      stackBottomOffset,
      tabBarBottomOffset,
      tabsUnderTop: navInfo.tabsUnderTop,
      usesNativeTabs,
    };
  }, [
    navInfo.tabsUnderTop,
    stackBottomOffset,
    tabBarBottomOffset,
    usesNativeTabs,
  ]);

  useEffect(() => {
    if (!usesNativeTabs) {
      setStackTransition(stackTransitionSnapshot);
      return;
    }

    const listener = (snapshot: StackTransitionSnapshot) => {
      setStackTransition(prev => {
        if (
          prev.phase === snapshot.phase &&
          prev.closing === snapshot.closing
        ) {
          return prev;
        }
        return snapshot;
      });
    };

    stackTransitionListeners.add(listener);
    return () => {
      stackTransitionListeners.delete(listener);
    };
  }, [usesNativeTabs]);

  useEffect(() => {
    if (!usesNativeTabs) return;

    const listener = (progress: number) => {
      const trackedPosition = positionTrackingRef.current;
      if (!trackedPosition.usesNativeTabs || !trackedPosition.tabsUnderTop) {
        return;
      }
      bottomOffset.value = interpolateBottomOffset(
        trackedPosition.stackBottomOffset,
        trackedPosition.tabBarBottomOffset,
        progress,
      );
    };

    swipeProgressListeners.add(listener);
    return () => {
      swipeProgressListeners.delete(listener);
    };
  }, [bottomOffset, usesNativeTabs]);

  // Only kept as JS strings because `Icon` takes a `color` prop (not className),
  // and the outer floating wrapper needs a matching solid background underneath
  // the home-indicator safe-area inset. All other theme colors flow through
  // className (`bg-chrome`, `text-text-primary`, etc.) so styling stays in
  // tailwind and tracks theme changes automatically.
  const [accentPrimary, textMuted, chromeBorder, progressTrack] =
    useCSSVariable([
      '--color-accent-primary',
      '--color-text-muted',
      '--color-chrome-border',
      '--color-progress-track',
    ]) as [string, string, string, string];

  // Tick while resting so the countdown redraws each second. We use a bare
  // tick counter (not a cached `Date.now()`) to force re-renders — the actual
  // "now" used in calculations is read fresh at render time below. Caching it
  // in state would make the first render after going ready → resting show a
  // stale value (the countdown would briefly read too high).
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (restState !== 'resting') return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
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
  const activeSetLabel = (() => {
    if (activeSession == null || activeSetId == null) return null;
    for (const exercise of activeSession.exercises) {
      const set = exercise.sets.find(st => String(st.id) === activeSetId);
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
  })();

  useEffect(() => {
    const targetBottomOffset = shouldSitAboveTabs
      ? tabBarBottomOffset
      : stackBottomOffset;

    if (usesNativeTabs) {
      const isNativeClosingToTabs =
        navInfo.tabsUnderTop && stackTransition.closing;

      if (!isNativeClosingToTabs) {
        // Writing a Reanimated shared value from an effect is the supported API;
        // the compiler's immutability rule flags it as a mutation regardless.
        // eslint-disable-next-line react-hooks/immutability
        bottomOffset.value = targetBottomOffset;
      }
      return;
    }

    const config = {
      duration: SLIDE_ANIMATION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    };

    bottomOffset.value = withTiming(targetBottomOffset, config);
  }, [
    bottomOffset,
    navInfo.tabsUnderTop,
    shouldSitAboveTabs,
    stackBottomOffset,
    stackTransition.closing,
    stackTransition.phase,
    stackTransition.tick,
    tabBarBottomOffset,
    usesNativeTabs,
  ]);

  const positionStyle = useAnimatedStyle(() => ({
    bottom: bottomOffset.value,
  }));

  // The bar is a persistent workout HUD — visible for the entire active
  // workout, not just while a rest timer is running.
  if (sessionId == null) return null;
  if (navInfo.suppressed && !(usesNativeTabs && isClosingToTabs)) return null;
  if (variant === 'floating' && navInfo.isOnTabs && !usesNativeTabs) return null;

  const remainingMs = (() => {
    if (restState === 'resting' && endsAt != null) {
      // Read `Date.now()` fresh at render time — caching it in state would
      // briefly display a stale value on the first render after a new rest
      // starts (the `tick` state only advances via the 1s interval).
      // eslint-disable-next-line react-hooks/purity
      return Math.max(0, endsAt - Date.now());
    }
    if (restState === 'paused' && pausedRemainingMs != null)
      return pausedRemainingMs;
    return 0;
  })();
  const displaySeconds = Math.ceil(remainingMs / 1000);
  const progress =
    durationSec > 0
      ? Math.max(0, Math.min(1, remainingMs / (durationSec * 1000)))
      : 0;

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

  // Clear only via flush: a cold start can leave unsaved session edits with
  // the active-workout screen (and its autosave hook) unmounted, so dirty
  // state is saved before the workout is dismissed.
  const flushAndClear = async () => {
    const ok = await flushActiveWorkoutBeforeClear(queryClient);
    if (!ok) {
      Alert.alert(
        'Could not save your workout',
        'Some changes have not reached the server.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard anyway',
            style: 'destructive',
            onPress: () => useActiveWorkoutStore.getState().clearWorkout(),
          },
        ],
      );
      return;
    }
    useActiveWorkoutStore.getState().clearWorkout();
  };

  const handleClear = () => {
    if (isWorkoutComplete) {
      void flushAndClear();
      return;
    }
    Alert.alert(
      'Clear workout?',
      'This will end the current workout without saving progress.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            void flushAndClear();
          },
        },
      ],
    );
  };

  const handleCenterTap = () => {
    if (!navigationRef.isReady()) return;
    navigationRef.navigate('ActiveWorkout');
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
  //  - ready / paused → X (clear workout)
  //  - complete → hidden (checkmark on the right handles dismiss)
  const leftButton =
    restState === 'resting' ? (
      <Pressable
        onPress={handlePausePlay}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Pause"
        className="p-2"
      >
        <Icon name="pause" size={20} color={accentPrimary} weight="bold" />
      </Pressable>
    ) : isWorkoutComplete ? null : (
      <Pressable
        onPress={handleClear}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Clear workout"
        className="p-2"
      >
        <Icon name="close" size={20} color={textMuted} weight="bold" />
      </Pressable>
    );

  // Right button:
  //  - ready  → Play (complete the active set, advance + start rest)
  //  - resting → Check (skip rest / mark next ready)
  //  - paused → Play (resume the rest timer)
  //  - complete → checkmark to finish and dismiss the bar
  const rightButton = (() => {
    if (isWorkoutComplete) {
      return (
        <Pressable
          onPress={handleClear}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Finish workout"
          className="p-2"
        >
          <Icon
            name="checkmark"
            size={20}
            color={accentPrimary}
            weight="bold"
          />
        </Pressable>
      );
    }
    if (restState === 'resting') {
      return (
        <Pressable
          onPress={handleSkipRest}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Skip rest"
          // Filled accent pill so the "complete set" affordance pops against
          // the muted pause icon on the left and the countdown digits.
          className="h-8 w-8 items-center justify-center rounded-full border-2 border-accent-primary"
        >
          <Icon
            name="checkmark"
            size={18}
            color={accentPrimary}
            weight="bold"
          />
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
          <Icon name="play" size={20} color={accentPrimary} weight="bold" />
        </Pressable>
      );
    }
    return (
      <Pressable
        onPress={handleDoneSet}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Done, start next set"
        className="p-2"
      >
        <Icon name="play" size={20} color={accentPrimary} weight="bold" />
      </Pressable>
    );
  })();

  // Embedded mode adds bottom padding so the floating Add button (which rises
  // ~20pt above the tab bar top edge) overlaps an empty strip at the bottom
  // of the bar instead of covering content. Floating mode is on stack screens
  // where there's no FAB, so no clearance is needed.
  //
  // Use a fixed compact height. The content row fills the pill normally while
  // the progress bar is pinned to the bottom, which keeps text centering
  // independent from absolute-position stretch quirks.
  if (variant === 'embedded') {
    return (
      <View
        className="bg-chrome border-t border-chrome-border"
        style={{
          minHeight: BAR_CONTENT_HEIGHT + EMBEDDED_FAB_CLEARANCE,
          paddingBottom: EMBEDDED_FAB_CLEARANCE,
        }}
      >
        <LegacyWorkoutBarContent
          progress={progress}
          leftButton={leftButton}
          rightButton={rightButton}
          onCenterPress={handleCenterTap}
          topStatusLine={topStatusLine}
          primaryLine={primaryLine}
          secondaryLine={secondaryLine}
          countdownLabel={countdownLabel}
        />
      </View>
    );
  }

  if (!usesNativeTabs) {
    return (
      <View
        pointerEvents="box-none"
        className="absolute inset-x-0 bottom-0 z-50 bg-chrome"
        style={{ paddingBottom: insets.bottom }}
      >
        <View
          className="bg-chrome border-t border-chrome-border"
          style={{ minHeight: BAR_CONTENT_HEIGHT }}
        >
          <LegacyWorkoutBarContent
            progress={progress}
            leftButton={leftButton}
            rightButton={rightButton}
            onCenterPress={handleCenterTap}
            topStatusLine={topStatusLine}
            primaryLine={primaryLine}
            secondaryLine={secondaryLine}
            countdownLabel={countdownLabel}
          />
        </View>
      </View>
    );
  }

  const barBody = (
    <LiquidGlassSurface
      style={createLiquidGlassPillStyle(chromeBorder, {
        height: BAR_CONTENT_HEIGHT,
        position: 'relative',
      })}
      colorScheme="auto"
      glassEffectStyle="regular"
      isInteractive
    >
      {/* Primary row — left control, stacked top/bottom text, right control.
          Intrinsically sized so the bar grows when the bottom line wraps. */}
      <View
        className="flex-row items-center px-2"
        style={{
          flex: 1,
        }}
      >
        <View className="w-10 items-center">{leftButton}</View>

        <Pressable
          onPress={handleCenterTap}
          className="px-1"
          style={{
            alignItems: 'center',
            flex: 1,
            height: '100%',
            justifyContent: 'center',
          }}
          accessibilityRole="button"
          accessibilityLabel="Open active workout"
        >
          {topStatusLine != null && (
            <Text
              numberOfLines={1}
              className="text-center text-sm font-semibold text-text-primary"
              style={{ lineHeight: 16 }}
            >
              {topStatusLine}
            </Text>
          )}
          <Text
            numberOfLines={1}
            className={
              topStatusLine != null
                ? 'text-center text-xs text-text-primary'
                : 'text-center text-sm font-semibold text-text-primary'
            }
            style={{ lineHeight: topStatusLine != null ? 14 : 16 }}
          >
            {primaryLine}
          </Text>
          {secondaryLine.length > 0 && (
            <Text
              numberOfLines={1}
              className="text-center text-xs text-text-secondary"
              style={{ lineHeight: 14 }}
            >
              {secondaryLine}
            </Text>
          )}
        </Pressable>

        {countdownLabel != null && (
          <Text
            className="px-2 text-lg font-bold text-text-primary"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {countdownLabel}
          </Text>
        )}

        <View className="w-10 items-center">{rightButton}</View>
      </View>

      {/* Progress bar — inset into the glass surface. Width is the only dynamic
          value; colors still track the active theme. */}
      <View
        pointerEvents="none"
        className="absolute inset-x-4 h-[3px] overflow-hidden rounded-full"
        style={{
          bottom: PROGRESS_BAR_BOTTOM_OFFSET,
          backgroundColor: withAlpha(progressTrack, 0.78),
        }}
      >
        <View
          className="h-[3px]"
          style={{
            width: `${progress * 100}%`,
            backgroundColor: withAlpha(accentPrimary, 0.92),
          }}
        />
      </View>
    </LiquidGlassSurface>
  );

  return (
    <Animated.View
      pointerEvents="box-none"
      className="absolute inset-x-0 z-50"
      style={positionStyle}
    >
      {barBody}
    </Animated.View>
  );
};

export default ActiveWorkoutBar;
