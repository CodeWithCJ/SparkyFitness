import { Platform, type TextInput } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';
import { focusSetCellInput } from '../../src/components/SetRowChrome';

const mockedIsVisible = KeyboardController.isVisible as jest.Mock;
const mockedSetFocusTo = KeyboardController.setFocusTo as jest.Mock;

const makeRef = ({ focused = true } = {}) => {
  const input = {
    focus: jest.fn(),
    isFocused: jest.fn(() => focused),
  };
  return { input, ref: { current: input as unknown as TextInput } };
};

describe('focusSetCellInput', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedIsVisible.mockReturnValue(true);
    mockedSetFocusTo.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('focuses the input immediately', () => {
    const { input, ref } = makeRef();

    focusSetCellInput(ref);

    expect(input.focus).toHaveBeenCalledTimes(1);
  });

  it('schedules no retries on iOS', () => {
    const osSpy = jest.replaceProperty(Platform, 'OS', 'ios');
    const { ref } = makeRef();
    mockedIsVisible.mockReturnValue(false);

    const cleanup = focusSetCellInput(ref);
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

      focusSetCellInput(ref);
      jest.runAllTimers();

      expect(mockedSetFocusTo).toHaveBeenCalledWith('current');
    });

    it('leaves a visible keyboard alone', () => {
      const { ref } = makeRef({ focused: true });
      mockedIsVisible.mockReturnValue(true);

      focusSetCellInput(ref);
      jest.runAllTimers();

      expect(mockedSetFocusTo).not.toHaveBeenCalled();
    });

    it('does not re-show once the input has lost focus', () => {
      const { ref } = makeRef({ focused: false });
      mockedIsVisible.mockReturnValue(false);

      focusSetCellInput(ref);
      jest.runAllTimers();

      expect(mockedSetFocusTo).not.toHaveBeenCalled();
    });

    it('cancels pending retries via the returned cleanup', () => {
      const { ref } = makeRef({ focused: true });
      mockedIsVisible.mockReturnValue(false);

      const cleanup = focusSetCellInput(ref);
      cleanup?.();
      jest.runAllTimers();

      expect(mockedSetFocusTo).not.toHaveBeenCalled();
    });
  });
});
