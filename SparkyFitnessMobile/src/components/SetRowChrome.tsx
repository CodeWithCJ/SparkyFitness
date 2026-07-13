import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import LiquidGlassSurface, { createLiquidGlassPillStyle } from './LiquidGlassSurface';

/**
 * Presentation shared by the set rows (ActiveWorkoutSetRow and the activity
 * form's EditableSetRow): the iOS keyboard accessory bar and the right-swipe
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
      style={createLiquidGlassPillStyle(chromeBorder, { marginHorizontal: 0, marginBottom: 0 })}
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
