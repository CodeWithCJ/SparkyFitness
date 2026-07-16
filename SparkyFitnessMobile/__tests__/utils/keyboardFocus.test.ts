import { Platform, type TextInput } from 'react-native';
import { KeyboardController, KeyboardEvents } from 'react-native-keyboard-controller';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  focusWithAndroidImeRetry,
  pasteFromClipboard,
  runAfterKeyboardSettles,
  scheduleAndroidImeShowRetry,
} from '../../src/utils/keyboardFocus';

const mockedIsVisible = KeyboardController.isVisible as jest.Mock;
const mockedSetFocusTo = KeyboardController.setFocusTo as jest.Mock;
const mockedAddListener = KeyboardEvents.addListener as jest.Mock;
const mockedGetString = Clipboard.getString as jest.Mock;

const makeRef = ({ focused = true } = {}) => {
  const input = {
    focus: jest.fn(),
    isFocused: jest.fn(() => focused),
  };
  return { input, ref: { current: input as unknown as TextInput } };
};

describe('keyboardFocus', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedIsVisible.mockReturnValue(true);
    mockedSetFocusTo.mockClear();
    mockedAddListener.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('focusWithAndroidImeRetry', () => {
    it('focuses the input immediately', () => {
      const { input, ref } = makeRef();

      focusWithAndroidImeRetry(ref);

      expect(input.focus).toHaveBeenCalledTimes(1);
    });
  });

  describe('pasteFromClipboard', () => {
    it('sets the clipboard text and focuses the input so iOS repaints it', async () => {
      const { input, ref } = makeRef();
      mockedGetString.mockResolvedValue('https://example.com');
      const setValue = jest.fn();

      await pasteFromClipboard(ref, setValue);

      expect(setValue).toHaveBeenCalledWith('https://example.com');
      expect(input.focus).toHaveBeenCalledTimes(1);
    });

    it('still sets the value when the input has unmounted', async () => {
      mockedGetString.mockResolvedValue('secret-key');
      const setValue = jest.fn();

      await pasteFromClipboard({ current: null }, setValue);

      expect(setValue).toHaveBeenCalledWith('secret-key');
    });
  });

  describe('runAfterKeyboardSettles', () => {
    it('runs after the settle delay when no keyboard is up', () => {
      mockedIsVisible.mockReturnValue(false);
      const action = jest.fn();

      runAfterKeyboardSettles(action, 350);

      expect(mockedAddListener).not.toHaveBeenCalled();
      jest.advanceTimersByTime(349);
      expect(action).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(action).toHaveBeenCalledTimes(1);
    });

    it('waits for keyboardDidHide instead of the timer while the keyboard is up', () => {
      mockedIsVisible.mockReturnValue(true);
      const remove = jest.fn();
      mockedAddListener.mockReturnValue({ remove });
      const action = jest.fn();

      runAfterKeyboardSettles(action, 350);

      expect(mockedAddListener).toHaveBeenCalledWith('keyboardDidHide', expect.any(Function));
      jest.runAllTimers();
      expect(action).not.toHaveBeenCalled();

      const listener = mockedAddListener.mock.calls[0][1] as () => void;
      listener();
      expect(action).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalled();
    });

    it('cancel removes the hide listener before it fires', () => {
      mockedIsVisible.mockReturnValue(true);
      const remove = jest.fn();
      mockedAddListener.mockReturnValue({ remove });
      const action = jest.fn();

      const cancel = runAfterKeyboardSettles(action, 350);
      cancel();

      expect(remove).toHaveBeenCalled();
      expect(action).not.toHaveBeenCalled();
    });

    it('cancel clears the pending timer', () => {
      mockedIsVisible.mockReturnValue(false);
      const action = jest.fn();

      const cancel = runAfterKeyboardSettles(action, 350);
      cancel();
      jest.runAllTimers();

      expect(action).not.toHaveBeenCalled();
    });
  });

  describe('scheduleAndroidImeShowRetry', () => {
    it('schedules no retries on iOS', () => {
      const osSpy = jest.replaceProperty(Platform, 'OS', 'ios');
      const { ref } = makeRef();
      mockedIsVisible.mockReturnValue(false);

      const cleanup = scheduleAndroidImeShowRetry(ref);
      jest.runAllTimers();

      expect(cleanup).toBeUndefined();
      expect(mockedSetFocusTo).not.toHaveBeenCalled();
      osSpy.restore();
    });

    describe('on Android', () => {
      let osSpy: ReturnType<typeof jest.replaceProperty>;

      beforeEach(() => {
        osSpy = jest.replaceProperty(Platform, 'OS', 'android');
      });

      afterEach(() => {
        osSpy.restore();
      });

      it('re-shows the keyboard when it never appeared for the focused input', () => {
        const { ref } = makeRef({ focused: true });
        mockedIsVisible.mockReturnValue(false);

        scheduleAndroidImeShowRetry(ref);
        jest.runAllTimers();

        expect(mockedSetFocusTo).toHaveBeenCalledWith('current');
      });

      it('leaves a visible keyboard alone', () => {
        const { ref } = makeRef({ focused: true });
        mockedIsVisible.mockReturnValue(true);

        scheduleAndroidImeShowRetry(ref);
        jest.runAllTimers();

        expect(mockedSetFocusTo).not.toHaveBeenCalled();
      });

      it('does not re-show once the input has lost focus', () => {
        const { ref } = makeRef({ focused: false });
        mockedIsVisible.mockReturnValue(false);

        scheduleAndroidImeShowRetry(ref);
        jest.runAllTimers();

        expect(mockedSetFocusTo).not.toHaveBeenCalled();
      });

      it('cancels pending retries via the returned cleanup', () => {
        const { ref } = makeRef({ focused: true });
        mockedIsVisible.mockReturnValue(false);

        const cleanup = scheduleAndroidImeShowRetry(ref);
        cleanup?.();
        jest.runAllTimers();

        expect(mockedSetFocusTo).not.toHaveBeenCalled();
      });
    });
  });
});
