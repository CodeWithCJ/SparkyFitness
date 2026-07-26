import React from 'react';
import { Keyboard, Platform, View } from 'react-native';
import { KeyboardEvents } from 'react-native-keyboard-controller';
import { render, fireEvent, act } from '@testing-library/react-native';
import {
  useSetEditAccessoryBar,
  type SetRowAccessoryHandle,
} from '../../src/components/SetRowChrome';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';

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
      for (const key of Object.keys(handles)) onRegisterAccessoryHandle(key, null);
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
      />,
    );
    expect(queryByText('Done')).toBeNull();
  });

  it('walks weight → reps → RPE with Next, then Next Set (RPE column shown)', () => {
    const handles = { set1: makeHandle() };
    const props = { activeSetKey: 'ex1:set1', onDeactivateSet: jest.fn(), handles };
    const utils = render(<Harness {...props} activeSetField="weight" />);
    expect(utils.getByText('Next')).toBeTruthy();

    utils.rerender(<Harness {...props} activeSetField="reps" />);
    expect(utils.getByText('Next')).toBeTruthy();

    utils.rerender(<Harness {...props} activeSetField="rpe" />);
    expect(utils.getByText('Next Set')).toBeTruthy();
  });

  it('walks a duration cell straight to RPE, then Next Set', () => {
    const handles = { set1: makeHandle() };
    const props = { activeSetKey: 'ex1:set1', onDeactivateSet: jest.fn(), handles };
    const utils = render(<Harness {...props} activeSetField="duration" />);
    // Duration is the row's only value input — Next targets RPE directly.
    fireEvent.press(utils.getByText('Next'));
    expect(handles.set1.focusField).toHaveBeenCalledWith('rpe');

    utils.rerender(<Harness {...props} activeSetField="duration" rpeEnabled={false} />);
    expect(utils.getByText('Next Set')).toBeTruthy();
  });

  it('skips the RPE hop when RPE is disabled (preset form) or another metric column shows', () => {
    const handles = { set1: makeHandle() };
    const props = { activeSetKey: 'ex1:set1', onDeactivateSet: jest.fn(), handles };
    const noRpe = render(<Harness {...props} activeSetField="reps" rpeEnabled={false} />);
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
      <Harness {...props} activeSetKey="ex1:set2" activeSetField="weight" />,
    );
    fireEvent.press(utils.getByText('Next'));
    expect(focused.focusField).toHaveBeenCalledWith('reps');
    expect(other.focusField).not.toHaveBeenCalled();

    utils.rerender(<Harness {...props} activeSetKey="ex1:set2" activeSetField="reps" />);
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
      />,
    );
    fireEvent.press(getByText('Next Set'));
    expect(focused.advance).toHaveBeenCalledTimes(1);
    expect(focused.focusField).not.toHaveBeenCalled();
  });

  it('Done deactivates the set and drops the keyboard', () => {
    const onDeactivateSet = jest.fn();
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const { getByText } = render(
      <Harness
        activeSetKey="ex1:set1"
        activeSetField="weight"
        onDeactivateSet={onDeactivateSet}
        handles={{ set1: makeHandle() }}
      />,
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
      />,
    );
    const hideCall = addListener.mock.calls.find(([event]) => event === 'keyboardDidHide');
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
        />,
      );
      const hide = addListener.mock.calls.find(([event]) => event === 'keyboardDidHide')![1];
      const show = addListener.mock.calls.find(([event]) => event === 'keyboardDidShow')![1];
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

  it('a null registration removes the handle so a stale key cannot dispatch', () => {
    const handle = makeHandle();
    const props = {
      activeSetKey: 'ex1:set1',
      activeSetField: 'weight' as const,
      onDeactivateSet: jest.fn(),
    };
    const { getByText, rerender } = render(<Harness {...props} handles={{ set1: handle }} />);
    // Re-rendering with no handles runs the effect cleanup, unregistering set1.
    rerender(<Harness {...props} handles={{}} />);
    fireEvent.press(getByText('Next'));
    expect(handle.focusField).not.toHaveBeenCalled();
  });
});
