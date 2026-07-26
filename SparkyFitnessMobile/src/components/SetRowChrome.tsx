import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, Platform, Text, TouchableOpacity, View } from 'react-native';
import { KeyboardEvents, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useCSSVariable } from 'uniwind';

import LiquidGlassSurface, { createLiquidGlassPillStyle } from './LiquidGlassSurface';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';

/**
 * Presentation shared by the set rows (ActiveWorkoutSetRow and the activity
 * form's EditableSetRow): the keyboard accessory bar (per-input on iOS for
 * EditableSetRow, screen-level for the card surfaces) and the right-swipe
 * Delete action.
 */

let accessoryEpochCounter = 0;

/**
 * Salt for a set row's iOS input-accessory nativeIDs, fresh on each activation
 * of the row's editing state. Fabric recycles native TextInputs into a pool:
 * `prepareForRecycle` clears the backing field's `inputAccessoryViewID` but
 * the pooled instance keeps its last-committed props, so remounting an input
 * with the exact same ID string diffs as unchanged, never re-applies it, and
 * the InputAccessoryView can't find its input — the keyboard comes up bare on
 * the second edit of the same cell. A never-repeating epoch in the ID defeats
 * that stale diff. The epoch changes only when `active` flips on, so the
 * accessory attachment survives re-renders while the keyboard is up.
 */
export function useAccessoryEpoch(active: boolean): number {
  // Discarded renders may burn counter values; only uniqueness matters.
  const [epoch, setEpoch] = useState(() => (active ? ++accessoryEpochCounter : 0));
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    if (active) setEpoch(++accessoryEpochCounter);
  }
  return epoch;
}

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

export interface SetAccessoryAction {
  key: string;
  label: string;
  onPress: () => void;
  /** Heavier weight for the primary action (e.g. Log). */
  bold?: boolean;
}

/** Floating pill button: Liquid Glass on iOS 26+, themed chrome chip elsewhere. */
function AccessoryPillButton({
  label,
  onPress,
  bold,
  accentPrimary,
  chromeBorder,
}: {
  label: string;
  onPress: () => void;
  bold?: boolean;
  accentPrimary: string;
  chromeBorder: string;
}) {
  return (
    <LiquidGlassSurface
      style={createLiquidGlassPillStyle(chromeBorder, {
        marginHorizontal: 0,
        marginBottom: 0,
        // The pill default's elevation 8 renders as a heavy shadow blob under
        // these small keyboard buttons on Android; 2 is enough lift.
        ...(Platform.OS === 'android' ? { elevation: 2 } : null),
      })}
      isInteractive
    >
      <TouchableOpacity
        onPress={onPress}
        hitSlop={HIT_SLOP}
        style={{ paddingHorizontal: 16, paddingVertical: 8 }}
      >
        <Text style={{ color: accentPrimary, fontWeight: bold ? '700' : '600', fontSize: 16 }}>
          {label}
        </Text>
      </TouchableOpacity>
    </LiquidGlassSurface>
  );
}

/**
 * iOS input-accessory strip: floating pill buttons on a transparent background
 * so the app content stays visible against the Liquid Glass keyboard — Done on
 * the left (dismisses the keyboard), row-specific actions on the right. Render
 * inside an InputAccessoryView.
 */
export function SetInputAccessoryBar({
  onDone,
  actions,
}: {
  onDone: () => void;
  actions: SetAccessoryAction[];
}) {
  const [accentPrimary, chromeBorder] = useCSSVariable([
    '--color-accent-primary',
    '--color-chrome-border',
  ]) as [string, string];

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingTop: 4,
        paddingBottom: 8,
      }}
    >
      <AccessoryPillButton
        label="Done"
        onPress={onDone}
        accentPrimary={accentPrimary}
        chromeBorder={chromeBorder}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {actions.map((action) => (
          <AccessoryPillButton
            key={action.key}
            label={action.label}
            onPress={action.onPress}
            bold={action.bold}
            accentPrimary={accentPrimary}
            chromeBorder={chromeBorder}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Deactivation grace on Android: right after the keyboard opens, a phantom
 * keyboardDidHide can arrive while the keyboard stays up —
 * react-native-keyboard-controller's inset-desync recovery
 * (onApplyWindowInsets) reads a transient zero height as the resized window
 * settles and force-emits a hide. A real dismissal is never followed by a
 * show, so waiting this long for a cancelling keyboardDidShow filters the
 * phantom; the settle burst is a frame or two, this is ~9 frames of margin.
 */
const ANDROID_PHANTOM_HIDE_GRACE_MS = 150;

/**
 * Runs `onDeactivate` when the keyboard leaves — accessory Done, a tap
 * outside the grid, the Android back gesture — so the focused-cell edit
 * always ends with the keyboard. On Android the call is deferred by
 * {@link ANDROID_PHANTOM_HIDE_GRACE_MS} and cancelled by a keyboardDidShow
 * inside that window, so a phantom hide can't tear the accessory bar down
 * (and flush the row's drafts) under a live keyboard.
 */
export function useDeactivateOnKeyboardDismiss(onDeactivate: () => void): void {
  useEffect(() => {
    if (Platform.OS !== 'android') {
      const subscription = KeyboardEvents.addListener('keyboardDidHide', onDeactivate);
      return () => subscription.remove();
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const hide = KeyboardEvents.addListener('keyboardDidHide', () => {
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        onDeactivate();
      }, ANDROID_PHANTOM_HIDE_GRACE_MS);
    });
    const show = KeyboardEvents.addListener('keyboardDidShow', () => {
      if (timer != null) clearTimeout(timer);
      timer = null;
    });
    return () => {
      hide.remove();
      show.remove();
      if (timer != null) clearTimeout(timer);
    };
  }, [onDeactivate]);
}

/**
 * The editable cells a set row can hold keyboard focus on. Which cells exist
 * depends on the exercise's modality (`duration` rows have no weight/reps
 * cell and vice versa), but the focus/accessory plumbing is modality-blind —
 * a field only ever names an input the row actually rendered.
 */
export type SetInputField = 'weight' | 'reps' | 'duration' | 'rpe';

/**
 * Imperative surface a set row registers with its owning screen so the shared
 * keyboard accessory bar (a screen-level KeyboardStickyView, not a per-input
 * iOS InputAccessoryView) can act on the focused row.
 */
export interface SetRowAccessoryHandle {
  /** Live: flush the row's in-progress drafts, then complete the set. */
  log: () => void;
  /** Move the keyboard between the row's always-mounted inputs natively. */
  focusField: (field: SetInputField) => void;
  /** Edit: move on to the next set — or add one when this is the last row. */
  advance: () => void;
}

/**
 * Screen-level keyboard accessory bar for the card-based edit forms, on both
 * platforms (per-input InputAccessoryViews are iOS-only, which left Android
 * with a bare keyboard). Mirrors the live screen's bar: rows register a
 * {@link SetRowAccessoryHandle} keyed by set clientId, and the bar dispatches
 * Done / Next / Next Set to the focused row's handle at press time.
 *
 * Render `accessoryBar` at the screen root as a sibling of the scroll view (a
 * sticky view inside scroll content won't stick) and pass
 * `onRegisterAccessoryHandle` to the exercise list.
 */
export function useSetEditAccessoryBar({
  activeSetKey,
  activeSetField,
  onDeactivateSet,
  rpeEnabled = true,
}: {
  /** `${exerciseClientId}:${setClientId}` from useExerciseSetEditing. */
  activeSetKey: string | null;
  activeSetField: SetInputField;
  onDeactivateSet: () => void;
  /** False when the form's sets store no RPE (the preset form). */
  rpeEnabled?: boolean;
}): {
  onRegisterAccessoryHandle: (key: string, handle: SetRowAccessoryHandle | null) => void;
  accessoryBar: ReactNode;
} {
  const handlesRef = useRef<Record<string, SetRowAccessoryHandle>>({});
  const onRegisterAccessoryHandle = useCallback(
    (key: string, handle: SetRowAccessoryHandle | null) => {
      if (handle == null) delete handlesRef.current[key];
      else handlesRef.current[key] = handle;
    },
    [],
  );

  // The keyboard leaving — accessory Done, a tap outside the grid, the
  // Android back gesture — always ends the cell edit: clearing the focus
  // state flushes the row's drafts and unmounts the bar.
  useDeactivateOnKeyboardDismiss(onDeactivateSet);

  const handleDone = useCallback(() => {
    onDeactivateSet();
    Keyboard.dismiss();
  }, [onDeactivateSet]);

  // Rows register by set clientId — the second half of the composite focus key.
  const focusedSetClientId =
    activeSetKey == null ? null : activeSetKey.slice(activeSetKey.indexOf(':') + 1);

  // The keyboard walk mirrors the live bar: weight → reps → RPE (when that
  // column is shown), then on to the next set. A duration cell is its row's
  // only value input, so it walks straight to RPE / Next Set like reps does.
  // In-row hops are native focusField moves through the handle; the
  // row-crossing hop is advance().
  const metricColumn = useAppPreferencesStore((s) => s.activeWorkoutMetricColumn);
  const nextField =
    activeSetField === 'weight'
      ? ('reps' as const)
      : (activeSetField === 'reps' || activeSetField === 'duration') &&
          metricColumn === 'rpe' &&
          rpeEnabled
        ? ('rpe' as const)
        : null;

  const accessoryBar: ReactNode =
    activeSetKey == null ? null : (
      <KeyboardStickyView style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <SetInputAccessoryBar
          onDone={handleDone}
          actions={[
            nextField != null
              ? {
                  key: 'next',
                  label: 'Next',
                  onPress: () => {
                    if (focusedSetClientId != null) {
                      handlesRef.current[focusedSetClientId]?.focusField(nextField);
                    }
                  },
                }
              : {
                  key: 'next-set',
                  label: 'Next Set',
                  onPress: () => {
                    if (focusedSetClientId != null) {
                      handlesRef.current[focusedSetClientId]?.advance();
                    }
                  },
                },
          ]}
        />
      </KeyboardStickyView>
    );

  return { onRegisterAccessoryHandle, accessoryBar };
}

/** Right-swipe Delete action for ReanimatedSwipeable's renderRightActions. */
export function SetSwipeDeleteAction({
  onPress,
  accessibilityLabel,
}: {
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity
      className="bg-bg-danger justify-center items-center"
      style={{ width: 72 }}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={accessibilityLabel}
    >
      <Text className="text-text-danger font-semibold text-sm">Delete</Text>
    </TouchableOpacity>
  );
}
