import React from 'react';
import {
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  KeyboardEvents,
  useKeyboardState,
} from 'react-native-keyboard-controller';
import {
  render,
  fireEvent,
  act,
  type ReactTestInstance,
} from '@testing-library/react-native';
import {
  SET_ACCESSORY_BAR_HEIGHT,
  StickySetInputAccessoryBar,
  useSetEditAccessoryBar,
  type SetAccessoryAction,
  type SetRowAccessoryHandle,
} from '../../src/components/SetRowChrome';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';

const mockedUseKeyboardState = useKeyboardState as jest.Mock;
const defaultKeyboardState = mockedUseKeyboardState.getMockImplementation();

/** The global mock reports the keyboard up; this flips it for one test. */
function setKeyboardVisible(isVisible: boolean) {
  mockedUseKeyboardState.mockImplementation(
    (selector?: (state: { isVisible: boolean }) => unknown) => {
      const state = { isVisible };
      return selector ? selector(state) : state;
    }
  );
}

afterEach(() => {
  mockedUseKeyboardState.mockImplementation(defaultKeyboardState);
});

type FocusedInput = ReturnType<typeof TextInput.State.currentlyFocusedInput>;
/** Stand-ins for the native inputs TextInputState reports as focused. */
const CELL_INPUT = {} as FocusedInput;
const OTHER_INPUT = {} as FocusedInput;

/** The bar is hidden from screen readers whenever it is not live. */
const INCLUDE_HIDDEN = { includeHiddenElements: true };

function makeHandle(): SetRowAccessoryHandle {
  return { log: jest.fn(), focusField: jest.fn(), advance: jest.fn() };
}

/**
 * Renders the hook's bar and registers `handles` (keyed by set clientId) the
 * way WorkoutFormExerciseList's rows do.
 */
function Harness({
  activeSetKey,
  activeSetField,
  onDeactivateSet,
  rpeEnabled,
  handles,
}: {
  activeSetKey: string | null;
  activeSetField: 'weight' | 'reps' | 'rpe';
  onDeactivateSet: () => void;
  rpeEnabled?: boolean;
  handles: Record<string, SetRowAccessoryHandle>;
}) {
  const { onRegisterAccessoryHandle, accessoryBar } = useSetEditAccessoryBar({
    activeSetKey,
    activeSetField,
    onDeactivateSet,
    rpeEnabled,
  });
  React.useEffect(() => {
    for (const [key, handle] of Object.entries(handles)) {
      onRegisterAccessoryHandle(key, handle);
    }
    return () => {
      for (const key of Object.keys(handles))
        onRegisterAccessoryHandle(key, null);
    };
  }, [onRegisterAccessoryHandle, handles]);
  return <View>{accessoryBar}</View>;
}

describe('useSetEditAccessoryBar', () => {
  afterEach(() => {
    __resetAppPreferencesStoreForTests();
  });

  it('renders no bar without a focused set', () => {
    const { queryByText } = render(
      <Harness
        activeSetKey={null}
        activeSetField="weight"
        onDeactivateSet={jest.fn()}
        handles={{}}
      />
    );
    expect(queryByText('Done', INCLUDE_HIDDEN)).toBeNull();
  });

  it("is the live screen's sticky bar: mounted throughout, parked behind the keyboard", () => {
    const props = {
      activeSetField: 'weight' as const,
      onDeactivateSet: jest.fn(),
      handles: { set1: makeHandle() },
    };
    const utils = render(<Harness {...props} activeSetKey={null} />);
    expect(
      utils.getByTestId('set-accessory-sticky', INCLUDE_HIDDEN).props.offset
    ).toEqual({ closed: SET_ACCESSORY_BAR_HEIGHT, opened: 0 });

    utils.rerender(<Harness {...props} activeSetKey="ex1:set1" />);
    expect(utils.getByTestId('set-accessory-bar').props).toMatchObject({
      accessibilityRole: 'toolbar',
      accessibilityLabel: 'Set entry actions',
    });
    expect(utils.getByRole('button', { name: 'Next' })).toBeTruthy();
  });

  it('walks weight → reps → RPE with Next, then Next Set (RPE column shown)', () => {
    const handles = { set1: makeHandle() };
    const props = {
      activeSetKey: 'ex1:set1',
      onDeactivateSet: jest.fn(),
      handles,
    };
    const utils = render(<Harness {...props} activeSetField="weight" />);
    expect(utils.getByText('Next')).toBeTruthy();

    utils.rerender(<Harness {...props} activeSetField="reps" />);
    expect(utils.getByText('Next')).toBeTruthy();

    utils.rerender(<Harness {...props} activeSetField="rpe" />);
    expect(utils.getByText('Next Set')).toBeTruthy();
  });

  it('walks a duration cell straight to RPE, then Next Set', () => {
    const handles = { set1: makeHandle() };
    const props = {
      activeSetKey: 'ex1:set1',
      onDeactivateSet: jest.fn(),
      handles,
    };
    const utils = render(<Harness {...props} activeSetField="duration" />);
    // Duration is the row's only value input — Next targets RPE directly.
    fireEvent.press(utils.getByText('Next'));
    expect(handles.set1.focusField).toHaveBeenCalledWith('rpe');

    utils.rerender(
      <Harness {...props} activeSetField="duration" rpeEnabled={false} />
    );
    expect(utils.getByText('Next Set')).toBeTruthy();
  });

  it('skips the RPE hop when RPE is disabled (preset form) or another metric column shows', () => {
    const handles = { set1: makeHandle() };
    const props = {
      activeSetKey: 'ex1:set1',
      onDeactivateSet: jest.fn(),
      handles,
    };
    const noRpe = render(
      <Harness {...props} activeSetField="reps" rpeEnabled={false} />
    );
    expect(noRpe.getByText('Next Set')).toBeTruthy();
    noRpe.unmount();

    // Nothing is mounted, so the store write needs no act wrapper.
    useAppPreferencesStore.getState().setActiveWorkoutMetricColumn('volume');
    const volume = render(<Harness {...props} activeSetField="reps" />);
    expect(volume.getByText('Next Set')).toBeTruthy();
  });

  it("dispatches in-row hops through the focused set's focusField", () => {
    const focused = makeHandle();
    const other = makeHandle();
    const props = {
      onDeactivateSet: jest.fn(),
      handles: { set1: other, set2: focused },
    };
    const utils = render(
      <Harness {...props} activeSetKey="ex1:set2" activeSetField="weight" />
    );
    fireEvent.press(utils.getByText('Next'));
    expect(focused.focusField).toHaveBeenCalledWith('reps');
    expect(other.focusField).not.toHaveBeenCalled();

    utils.rerender(
      <Harness {...props} activeSetKey="ex1:set2" activeSetField="reps" />
    );
    fireEvent.press(utils.getByText('Next'));
    expect(focused.focusField).toHaveBeenLastCalledWith('rpe');
    expect(focused.advance).not.toHaveBeenCalled();
  });

  it('dispatches the row-crossing hop through advance', () => {
    const focused = makeHandle();
    const { getByText } = render(
      <Harness
        activeSetKey="ex1:set1"
        activeSetField="rpe"
        onDeactivateSet={jest.fn()}
        handles={{ set1: focused }}
      />
    );
    fireEvent.press(getByText('Next Set'));
    expect(focused.advance).toHaveBeenCalledTimes(1);
    expect(focused.focusField).not.toHaveBeenCalled();
  });

  it('Done deactivates the set and drops the keyboard', () => {
    const onDeactivateSet = jest.fn();
    const dismiss = jest
      .spyOn(Keyboard, 'dismiss')
      .mockImplementation(() => {});
    const { getByText } = render(
      <Harness
        activeSetKey="ex1:set1"
        activeSetField="weight"
        onDeactivateSet={onDeactivateSet}
        handles={{ set1: makeHandle() }}
      />
    );
    fireEvent.press(getByText('Done'));
    expect(onDeactivateSet).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledTimes(1);
    dismiss.mockRestore();
  });

  it('deactivates when the keyboard hides (accessory Done, tap-away, Android back)', () => {
    const onDeactivateSet = jest.fn();
    const addListener = KeyboardEvents.addListener as jest.Mock;
    addListener.mockClear();
    render(
      <Harness
        activeSetKey="ex1:set1"
        activeSetField="weight"
        onDeactivateSet={onDeactivateSet}
        handles={{ set1: makeHandle() }}
      />
    );
    const hideCall = addListener.mock.calls.find(
      ([event]) => event === 'keyboardDidHide'
    );
    expect(hideCall).toBeTruthy();
    act(() => hideCall![1]());
    expect(onDeactivateSet).toHaveBeenCalledTimes(1);
  });

  it('Android: a phantom didHide is cancelled by the didShow that follows it', () => {
    // Right after the keyboard opens, Android can emit a hide while the
    // keyboard stays up (RNKC inset-desync recovery); deactivating on it
    // would tear the bar down and flush drafts under a live keyboard. Only a
    // hide with no show inside the grace window may deactivate.
    const osSpy = jest.replaceProperty(Platform, 'OS', 'android');
    jest.useFakeTimers();
    try {
      const onDeactivateSet = jest.fn();
      const addListener = KeyboardEvents.addListener as jest.Mock;
      addListener.mockClear();
      render(
        <Harness
          activeSetKey="ex1:set1"
          activeSetField="weight"
          onDeactivateSet={onDeactivateSet}
          handles={{ set1: makeHandle() }}
        />
      );
      const hide = addListener.mock.calls.find(
        ([event]) => event === 'keyboardDidHide'
      )![1];
      const show = addListener.mock.calls.find(
        ([event]) => event === 'keyboardDidShow'
      )![1];
      act(() => {
        hide();
        show();
        jest.advanceTimersByTime(1000);
      });
      expect(onDeactivateSet).not.toHaveBeenCalled();
      // A real dismissal is never followed by a show — the deferred
      // deactivation lands after the grace window.
      act(() => {
        hide();
        jest.advanceTimersByTime(1000);
      });
      expect(onDeactivateSet).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
      osSpy.restore();
    }
  });

  it('Android: a real hide also blurs the cell, so tapping it again brings the bar back', () => {
    // Android hides the keyboard on the back gesture but leaves the cell
    // focused; a second tap on a focused cell fires no onFocus, so without
    // the blur the bar would never come back.
    const osSpy = jest.replaceProperty(Platform, 'OS', 'android');
    const dismiss = jest
      .spyOn(Keyboard, 'dismiss')
      .mockImplementation(() => {});
    const focused = jest
      .spyOn(TextInput.State, 'currentlyFocusedInput')
      .mockReturnValue(CELL_INPUT);
    jest.useFakeTimers();
    try {
      const onDeactivateSet = jest.fn();
      const addListener = KeyboardEvents.addListener as jest.Mock;
      addListener.mockClear();
      render(
        <Harness
          activeSetKey="ex1:set1"
          activeSetField="weight"
          onDeactivateSet={onDeactivateSet}
          handles={{ set1: makeHandle() }}
        />
      );
      const hide = addListener.mock.calls.find(
        ([event]) => event === 'keyboardDidHide'
      )![1];
      const show = addListener.mock.calls.find(
        ([event]) => event === 'keyboardDidShow'
      )![1];
      // A phantom hide keeps the cell focused.
      act(() => {
        hide();
        show();
        jest.advanceTimersByTime(1000);
      });
      expect(dismiss).not.toHaveBeenCalled();

      act(() => {
        hide();
        jest.advanceTimersByTime(1000);
      });
      expect(onDeactivateSet).toHaveBeenCalledTimes(1);
      expect(dismiss).toHaveBeenCalledTimes(1);
      expect(dismiss.mock.invocationCallOrder[0]).toBeGreaterThan(
        onDeactivateSet.mock.invocationCallOrder[0]
      );
    } finally {
      jest.useRealTimers();
      focused.mockRestore();
      dismiss.mockRestore();
      osSpy.restore();
    }
  });

  it('Android: no blur when another input took focus during the grace (a Modal opening)', () => {
    // Opening a Modal makes the keyboard library emit a hide; the Modal's
    // field then focuses on show, before its keyboard reports anything. The
    // blur must not land on that field.
    const osSpy = jest.replaceProperty(Platform, 'OS', 'android');
    const dismiss = jest
      .spyOn(Keyboard, 'dismiss')
      .mockImplementation(() => {});
    const focused = jest
      .spyOn(TextInput.State, 'currentlyFocusedInput')
      .mockReturnValue(CELL_INPUT);
    jest.useFakeTimers();
    try {
      const onDeactivateSet = jest.fn();
      const addListener = KeyboardEvents.addListener as jest.Mock;
      addListener.mockClear();
      render(
        <Harness
          activeSetKey="ex1:set1"
          activeSetField="weight"
          onDeactivateSet={onDeactivateSet}
          handles={{ set1: makeHandle() }}
        />
      );
      const hide = addListener.mock.calls.find(
        ([event]) => event === 'keyboardDidHide'
      )![1];
      act(() => {
        hide();
        focused.mockReturnValue(OTHER_INPUT);
        jest.advanceTimersByTime(1000);
      });
      expect(onDeactivateSet).toHaveBeenCalledTimes(1);
      expect(dismiss).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
      focused.mockRestore();
      dismiss.mockRestore();
      osSpy.restore();
    }
  });

  it('Android: a keyboardWillShow inside the grace cancels the deactivation and the blur', () => {
    const osSpy = jest.replaceProperty(Platform, 'OS', 'android');
    const dismiss = jest
      .spyOn(Keyboard, 'dismiss')
      .mockImplementation(() => {});
    const focused = jest
      .spyOn(TextInput.State, 'currentlyFocusedInput')
      .mockReturnValue(CELL_INPUT);
    jest.useFakeTimers();
    try {
      const onDeactivateSet = jest.fn();
      const addListener = KeyboardEvents.addListener as jest.Mock;
      addListener.mockClear();
      render(
        <Harness
          activeSetKey="ex1:set1"
          activeSetField="weight"
          onDeactivateSet={onDeactivateSet}
          handles={{ set1: makeHandle() }}
        />
      );
      const hide = addListener.mock.calls.find(
        ([event]) => event === 'keyboardDidHide'
      )![1];
      const willShow = addListener.mock.calls.find(
        ([event]) => event === 'keyboardWillShow'
      )![1];
      act(() => {
        hide();
        willShow();
        jest.advanceTimersByTime(1000);
      });
      expect(onDeactivateSet).not.toHaveBeenCalled();
      expect(dismiss).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
      focused.mockRestore();
      dismiss.mockRestore();
      osSpy.restore();
    }
  });

  it('Android: a hide while no set cell is active blurs nothing', () => {
    // Keyboard events are app-wide: a hide on another screen, or one this
    // screen sees while no cell is focused, must leave the focused input be.
    const osSpy = jest.replaceProperty(Platform, 'OS', 'android');
    const dismiss = jest
      .spyOn(Keyboard, 'dismiss')
      .mockImplementation(() => {});
    const focused = jest
      .spyOn(TextInput.State, 'currentlyFocusedInput')
      .mockReturnValue(OTHER_INPUT);
    jest.useFakeTimers();
    try {
      const addListener = KeyboardEvents.addListener as jest.Mock;
      addListener.mockClear();
      render(
        <Harness
          activeSetKey={null}
          activeSetField="weight"
          onDeactivateSet={jest.fn()}
          handles={{ set1: makeHandle() }}
        />
      );
      const hide = addListener.mock.calls.find(
        ([event]) => event === 'keyboardDidHide'
      )![1];
      act(() => {
        hide();
        jest.advanceTimersByTime(1000);
      });
      expect(dismiss).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
      focused.mockRestore();
      dismiss.mockRestore();
      osSpy.restore();
    }
  });

  it('a null registration removes the handle so a stale key cannot dispatch', () => {
    const handle = makeHandle();
    const props = {
      activeSetKey: 'ex1:set1',
      activeSetField: 'weight' as const,
      onDeactivateSet: jest.fn(),
    };
    const { getByText, rerender } = render(
      <Harness {...props} handles={{ set1: handle }} />
    );
    // Re-rendering with no handles runs the effect cleanup, unregistering set1.
    rerender(<Harness {...props} handles={{}} />);
    fireEvent.press(getByText('Next'));
    expect(handle.focusField).not.toHaveBeenCalled();
  });
});

describe('StickySetInputAccessoryBar', () => {
  const log: SetAccessoryAction = {
    key: 'log',
    label: 'Log',
    bold: true,
    onPress: jest.fn(),
  };

  function renderBar(
    props: Partial<React.ComponentProps<typeof StickySetInputAccessoryBar>>
  ) {
    const base = { visible: true, onDone: jest.fn(), actions: [log] };
    const utils = render(<StickySetInputAccessoryBar {...base} {...props} />);
    const rerenderBar = (
      next: Partial<React.ComponentProps<typeof StickySetInputAccessoryBar>>
    ) => utils.rerender(<StickySetInputAccessoryBar {...base} {...next} />);
    return { ...utils, base, rerenderBar };
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('parks below the screen edge while the keyboard is closed and rides it when open', () => {
    const { getByTestId } = renderBar({ visible: false });
    const sticky = getByTestId('set-accessory-sticky', INCLUDE_HIDDEN);
    // translateY = keyboard height + interpolate(progress, [closed, opened]):
    // its own height below the edge at rest, flush on the keyboard when open.
    expect(sticky.props.offset).toEqual({
      closed: SET_ACCESSORY_BAR_HEIGHT,
      opened: 0,
    });
    // Transparent until the keyboard has started to rise (progress is 0 here).
    const guard = sticky.children[0] as ReactTestInstance;
    expect(StyleSheet.flatten(guard.props.style).opacity).toBe(0);
  });

  it('parks by its measured height, keeping it while empty', () => {
    const { getByTestId } = renderBar({ visible: false });
    const sticky = () => getByTestId('set-accessory-sticky', INCLUDE_HIDDEN);

    fireEvent(sticky(), 'layout', {
      nativeEvent: { layout: { height: 97.4 } },
    });
    expect(sticky().props.offset).toEqual({ closed: 98, opened: 0 });

    fireEvent(sticky(), 'layout', { nativeEvent: { layout: { height: 0 } } });
    expect(sticky().props.offset).toEqual({ closed: 98, opened: 0 });
  });

  it('shows Done and the actions as a toolbar while visible', () => {
    const { getByRole, getByTestId, base } = renderBar({});
    // Not itself an accessibility element, so its buttons stay reachable.
    expect(getByTestId('set-accessory-bar').props).toMatchObject({
      accessibilityRole: 'toolbar',
      accessibilityLabel: 'Set entry actions',
    });

    fireEvent.press(getByRole('button', { name: 'Log' }));
    expect(log.onPress).toHaveBeenCalledTimes(1);
    fireEvent.press(getByRole('button', { name: 'Done' }));
    expect(base.onDone).toHaveBeenCalledTimes(1);
  });

  it('renders no actions while not visible with the keyboard hidden', () => {
    setKeyboardVisible(false);
    const { queryByText, rerenderBar } = renderBar({ visible: false });
    expect(queryByText('Done', INCLUDE_HIDDEN)).toBeNull();

    rerenderBar({ visible: true });
    // A focused cell with the keyboard still down (e.g. a hardware keyboard):
    // parked off screen, so hidden from screen readers too.
    expect(queryByText('Log')).toBeNull();
    expect(queryByText('Log', INCLUDE_HIDDEN)).toBeTruthy();

    rerenderBar({ visible: false, actions: [] });
    expect(queryByText('Log', INCLUDE_HIDDEN)).toBeNull();
    expect(queryByText('Done', INCLUDE_HIDDEN)).toBeNull();
  });

  it('keeps the last content, untappable, while the keyboard is still leaving', () => {
    const { getByTestId, queryByText, rerenderBar } = renderBar({});
    expect(getByTestId('set-accessory-sticky').props.pointerEvents).toBe(
      'auto'
    );

    // The caller has moved on (no focused set, no actions); the bar keeps
    // what it showed so it slides down with the keyboard instead of emptying.
    rerenderBar({ visible: false, actions: [] });
    expect(queryByText('Log', INCLUDE_HIDDEN)).toBeTruthy();
    expect(queryByText('Log')).toBeNull();
    expect(
      getByTestId('set-accessory-sticky', INCLUDE_HIDDEN).props.pointerEvents
    ).toBe('none');

    // keyboardDidHide reaches useKeyboardState: the held content goes.
    setKeyboardVisible(false);
    rerenderBar({ visible: false, actions: [] });
    expect(queryByText('Log', INCLUDE_HIDDEN)).toBeNull();
    expect(queryByText('Done', INCLUDE_HIDDEN)).toBeNull();
  });

  it('drops held content after the fallback when the keyboard never reports hidden', () => {
    jest.useFakeTimers();
    const { queryByText, rerenderBar } = renderBar({});
    rerenderBar({ visible: false, actions: [] });

    act(() => jest.advanceTimersByTime(599));
    expect(queryByText('Log', INCLUDE_HIDDEN)).toBeTruthy();
    act(() => jest.advanceTimersByTime(1));
    expect(queryByText('Log', INCLUDE_HIDDEN)).toBeNull();
  });

  it('renders the rest slot above the buttons', () => {
    const { getByTestId } = renderBar({ restSlot: <Text>Rest row</Text> });
    // findAll walks the tree in render order.
    const texts = getByTestId('set-accessory-bar')
      .findAll((node) => node.type === 'Text')
      .map((node) => node.props.children);
    expect(texts.indexOf('Rest row')).toBeGreaterThanOrEqual(0);
    expect(texts.indexOf('Rest row')).toBeLessThan(texts.indexOf('Done'));
  });

  it('draws one opaque surface on Android; iOS keeps the transparent strip', () => {
    const ios = renderBar({});
    expect(
      ios.getByTestId('set-accessory-bar').props.className
    ).toBeUndefined();
    ios.unmount();

    const osSpy = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      const android = renderBar({});
      const bar = android.getByTestId('set-accessory-bar');
      expect(bar.props.className).toContain('bg-surface');
      expect(StyleSheet.flatten(bar.props.style).borderTopWidth).toBe(
        StyleSheet.hairlineWidth
      );
    } finally {
      osSpy.restore();
    }
  });
});
