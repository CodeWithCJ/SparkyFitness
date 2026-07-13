import type { RefObject } from 'react';
import { Platform, type TextInput } from 'react-native';
import { KeyboardController, KeyboardEvents } from 'react-native-keyboard-controller';

/** Spaced to outlast a slow IME bind while keeping the common case snappy. */
const IME_RETRY_DELAYS_MS = [100, 400];

/**
 * Android IME safety net for inputs that take focus as they mount (a
 * tap-to-edit cell swapping in a TextInput, or an `autoFocus` input). The
 * native focus request can win view focus while the IME's showSoftInput is
 * silently dropped (OEM-dependent; reported on Samsung), leaving a cursor
 * with no keyboard — and a plain re-focus() can't repair it because
 * TextInputState bails out when the field is already focused. The retries
 * instead go through KeyboardController.setFocusTo('current'), which
 * re-issues the native showSoftInput for the focused view; when the keyboard
 * came up normally they are skipped or no-op.
 *
 * Returns a cleanup that cancels pending retries, shaped for an effect return.
 */
export function scheduleAndroidImeShowRetry(
  ref: RefObject<TextInput | null>,
): (() => void) | undefined {
  if (Platform.OS !== 'android') return undefined;
  const timers = IME_RETRY_DELAYS_MS.map((delay) =>
    setTimeout(() => {
      if (ref.current?.isFocused() && !KeyboardController.isVisible()) {
        KeyboardController.setFocusTo('current');
      }
    }, delay),
  );
  return () => timers.forEach((timer) => clearTimeout(timer));
}

/**
 * Defers a programmatic scroll (or similar viewport move) until the keyboard
 * is out of the way. With the keyboard up — typically because the caller just
 * dismissed it — the action runs when the hide finishes, so the two motions
 * don't fight; otherwise it runs after `delayMsWhenHidden` (time for a
 * sibling layout animation to settle). Returns a cancel function, shaped for
 * an effect return.
 */
export function runAfterKeyboardSettles(
  action: () => void,
  delayMsWhenHidden: number,
): () => void {
  if (KeyboardController.isVisible()) {
    const subscription = KeyboardEvents.addListener('keyboardDidHide', () => {
      subscription.remove();
      action();
    });
    return () => subscription.remove();
  }
  const timer = setTimeout(action, delayMsWhenHidden);
  return () => clearTimeout(timer);
}

/**
 * Focus an input from a tap-to-edit activation effect, with the Android IME
 * retry above. Returns the retry cleanup, shaped for an effect return.
 */
export function focusWithAndroidImeRetry(
  ref: RefObject<TextInput | null>,
): (() => void) | undefined {
  ref.current?.focus();
  return scheduleAndroidImeShowRetry(ref);
}
