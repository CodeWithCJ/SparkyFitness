import { Text, TouchableOpacity, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

/**
 * Presentation shared by the set rows (ActiveWorkoutSetRow and the activity
 * form's EditableSetRow): the iOS keyboard accessory bar and the right-swipe
 * Delete action.
 */

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

export interface SetAccessoryAction {
  key: string;
  label: string;
  onPress: () => void;
  /** Heavier weight for the primary action (e.g. Log). */
  bold?: boolean;
}

/**
 * iOS input-accessory bar: Done on the left (dismisses the keyboard),
 * row-specific actions on the right. Render inside an InputAccessoryView.
 */
export function SetInputAccessoryBar({
  onDone,
  actions,
}: {
  onDone: () => void;
  actions: SetAccessoryAction[];
}) {
  const [accentPrimary, chromeBg, chromeBorder] = useCSSVariable([
    '--color-accent-primary',
    '--color-chrome',
    '--color-chrome-border',
  ]) as [string, string, string];

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: chromeBg,
        borderTopWidth: 1,
        borderTopColor: chromeBorder,
      }}
    >
      <TouchableOpacity onPress={onDone} hitSlop={HIT_SLOP}>
        <Text style={{ color: accentPrimary, fontWeight: '600', fontSize: 16 }}>Done</Text>
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
        {actions.map((action) => (
          <TouchableOpacity key={action.key} onPress={action.onPress} hitSlop={HIT_SLOP}>
            <Text
              style={{
                color: accentPrimary,
                fontWeight: action.bold ? '700' : '600',
                fontSize: 16,
              }}
            >
              {action.label}
            </Text>
          </TouchableOpacity>
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
