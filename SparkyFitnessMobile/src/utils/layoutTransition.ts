import { Platform } from 'react-native';
import { LinearTransition } from 'react-native-reanimated';

/**
 * The `layout` transition for views that move when a screen changes shape
 * (view <-> edit mode, a card expanding or collapsing).
 *
 * Android gets none. On Android (Reanimated 4.5, Fabric) a layout transition
 * can leave views drawn where they were before the change instead of where
 * they now belong: on the food entry screen, Edit leaves Delete Entry on top
 * of the notes toolbar and the quantity stepper over the nutrition card, and
 * the Date / Meal / Time pickers stop responding because what is drawn no
 * longer matches where the touch lands; in the active workout, expanding an
 * exercise draws its set rows over the next exercise. Without a transition
 * the views simply jump to their new place. iOS keeps the animation.
 */
export function linearLayoutTransition(durationMs?: number, delayMs = 0) {
  if (Platform.OS === 'android') return undefined;
  if (delayMs > 0) {
    const delayed = LinearTransition.delay(delayMs);
    return durationMs === undefined ? delayed : delayed.duration(durationMs);
  }
  return durationMs === undefined
    ? LinearTransition
    : LinearTransition.duration(durationMs);
}
