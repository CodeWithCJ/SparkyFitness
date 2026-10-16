import React from 'react';
import { BackHandler, Platform } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import AddSheet, { type AddSheetRef } from '../../src/components/AddSheet';

const mockBottomSheetControls = {
  openCount: 0,
  isPresentBlocked: false,
  present: jest.fn(() => {
    if (mockBottomSheetControls.isPresentBlocked) {
      return;
    }
    mockBottomSheetControls.openCount += 1;
  }),
  dismiss: jest.fn(),
  onDismiss: undefined as (() => void) | undefined,
  onAnimate: undefined as
    ((fromIndex: number, toIndex: number) => void) | undefined,
  onChange: undefined as ((index: number) => void) | undefined,
};

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    BottomSheetModal: React.forwardRef(
      ({ children, onDismiss, onAnimate, onChange }: any, ref) => {
        // Test mock stashes the latest handlers for assertions; writing to the
        // module-scoped controls during the mock's render is intentional.
        /* eslint-disable react-hooks/immutability */
        mockBottomSheetControls.onDismiss = onDismiss;
        mockBottomSheetControls.onAnimate = onAnimate;
        mockBottomSheetControls.onChange = onChange;
        /* eslint-enable react-hooks/immutability */

        React.useImperativeHandle(ref, () => ({
          present: mockBottomSheetControls.present,
          dismiss: mockBottomSheetControls.dismiss,
        }));

        return React.createElement(
          View,
          { testID: 'add-sheet-modal' },
          children
        );
      }
    ),
    BottomSheetView: ({ children }: any) =>
      React.createElement(View, null, children),
    BottomSheetBackdrop: () => null,
  };
});

function renderAddSheet(
  overrides: Partial<React.ComponentProps<typeof AddSheet>> = {}
) {
  const ref = React.createRef<AddSheetRef>();
  const props = {
    onAddFood: jest.fn(),
    onStartWorkout: jest.fn(),
    onAddActivity: jest.fn(),
    onLogWorkout: jest.fn(),
    onSyncHealthData: jest.fn(),
    onBarcodeScan: jest.fn(),
    onAddMeasurements: jest.fn(),
    onAddProgressPhotos: jest.fn(),
    onAddSymptoms: jest.fn(),
    onAskSparky: jest.fn(),
    ...overrides,
  };
  const utils = render(<AddSheet ref={ref} {...props} />);
  return { ref, props, ...utils };
}

describe('AddSheet', () => {
  let requestAnimationFrameSpy: jest.SpyInstance<
    number,
    [FrameRequestCallback]
  >;
  let cancelAnimationFrameSpy: jest.SpyInstance<void, [number]>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBottomSheetControls.openCount = 0;
    mockBottomSheetControls.isPresentBlocked = false;
    mockBottomSheetControls.onDismiss = undefined;
    mockBottomSheetControls.onAnimate = undefined;
    mockBottomSheetControls.onChange = undefined;
    requestAnimationFrameSpy = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
    cancelAnimationFrameSpy = jest
      .spyOn(global, 'cancelAnimationFrame')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });

  it('re-presents after dismiss if present is requested while a close is still winding down', () => {
    const { ref } = renderAddSheet();

    act(() => ref.current?.present());
    expect(mockBottomSheetControls.openCount).toBe(1);

    mockBottomSheetControls.isPresentBlocked = true;
    mockBottomSheetControls.onAnimate?.(0, -1);
    act(() => ref.current?.present());

    expect(mockBottomSheetControls.openCount).toBe(1);

    mockBottomSheetControls.isPresentBlocked = false;
    act(() => mockBottomSheetControls.onDismiss?.());

    expect(mockBottomSheetControls.openCount).toBe(2);
  });

  it('does not re-present after dismiss when no new present was requested', () => {
    const onDismissWithoutAction = jest.fn();
    const { ref } = renderAddSheet({ onDismissWithoutAction });

    act(() => ref.current?.present());
    expect(mockBottomSheetControls.openCount).toBe(1);

    mockBottomSheetControls.onAnimate?.(0, -1);
    act(() => mockBottomSheetControls.onDismiss?.());

    expect(mockBottomSheetControls.openCount).toBe(1);
    expect(onDismissWithoutAction).toHaveBeenCalledTimes(1);
  });

  it('renders the Measurements tile in the main grid', () => {
    const { ref, getByText } = renderAddSheet();

    act(() => ref.current?.present());
    expect(getByText('Measurements')).toBeTruthy();
  });

  it('invokes onAddProgressPhotos when the Progress Photos row is pressed', () => {
    const onAddProgressPhotos = jest.fn();
    const onDismissWithoutAction = jest.fn();
    const { ref, getByText } = renderAddSheet({
      onAddProgressPhotos,
      onDismissWithoutAction,
    });

    act(() => ref.current?.present());
    fireEvent.press(getByText('Progress Photos'));
    act(() => mockBottomSheetControls.onDismiss?.());

    expect(onAddProgressPhotos).toHaveBeenCalledTimes(1);
    expect(onDismissWithoutAction).not.toHaveBeenCalled();
  });

  it('invokes onSyncHealthData when the secondary Sync Health Data row is pressed', () => {
    const onSyncHealthData = jest.fn();
    const onDismissWithoutAction = jest.fn();
    const { ref, getByText } = renderAddSheet({
      onSyncHealthData,
      onDismissWithoutAction,
    });

    act(() => ref.current?.present());
    fireEvent.press(getByText('Sync Health Data'));
    act(() => mockBottomSheetControls.onDismiss?.());

    expect(onSyncHealthData).toHaveBeenCalledTimes(1);
    expect(onDismissWithoutAction).not.toHaveBeenCalled();
  });

  it('invokes onAddSymptoms when the secondary Symptoms row is pressed', () => {
    const onAddSymptoms = jest.fn();
    const onDismissWithoutAction = jest.fn();
    const { ref, getByText } = renderAddSheet({
      onAddSymptoms,
      onDismissWithoutAction,
    });

    act(() => ref.current?.present());
    fireEvent.press(getByText('Symptoms'));
    act(() => mockBottomSheetControls.onDismiss?.());

    expect(onAddSymptoms).toHaveBeenCalledTimes(1);
    expect(onDismissWithoutAction).not.toHaveBeenCalled();
  });

  it('invokes onAddMood when the secondary Mood row is pressed', () => {
    const onAddMood = jest.fn();
    const { ref, getByText } = renderAddSheet({ onAddMood });

    act(() => ref.current?.present());
    fireEvent.press(getByText('Mood'));
    act(() => mockBottomSheetControls.onDismiss?.());

    expect(onAddMood).toHaveBeenCalledTimes(1);
  });

  it('offers live start, activity, and past logging in the exercise submenu', () => {
    const { ref, props, getByText, queryByText } = renderAddSheet();

    act(() => ref.current?.present({ initialMenu: 'exercise' }));

    expect(getByText('Workout')).toBeTruthy();
    expect(getByText('Live sets & reps')).toBeTruthy();
    expect(getByText('Activity')).toBeTruthy();
    expect(getByText('Log Workout')).toBeTruthy();
    expect(getByText('Past sets & reps')).toBeTruthy();
    expect(queryByText('Preset')).toBeNull();

    fireEvent.press(getByText('Workout'));
    expect(props.onStartWorkout).toHaveBeenCalledTimes(1);
    expect(props.onLogWorkout).not.toHaveBeenCalled();
  });

  it('renders Polish labels when the active i18n language is Polish', async () => {
    const {
      default: i18n,
      initializeI18n,
    } = require('../../src/localization/i18n');
    await initializeI18n('en');
    const { ref, getByText } = renderAddSheet();
    await i18n.changeLanguage('pl');
    act(() => ref.current?.present({ initialMenu: 'exercise' }));
    expect(getByText('Trening')).toBeTruthy();
    expect(getByText('Serie i powtórzenia na żywo')).toBeTruthy();
    expect(getByText('Wstecz')).toBeTruthy();
    await i18n.changeLanguage('en');
  });

  it('fires onLogWorkout from the Log Workout submenu option', () => {
    const { ref, props, getByText } = renderAddSheet();

    act(() => ref.current?.present({ initialMenu: 'exercise' }));
    fireEvent.press(getByText('Log Workout'));

    expect(props.onLogWorkout).toHaveBeenCalledTimes(1);
    expect(props.onStartWorkout).not.toHaveBeenCalled();
  });

  // BottomSheetModal does not handle Android's hardware Back, so before the
  // sheet took it the press reached navigation and closed the app from the
  // Dashboard (#2868).
  describe('Android hardware Back', () => {
    let listeners: (() => boolean | null | undefined)[];
    let remove: jest.Mock;
    let addEventListenerSpy: jest.SpyInstance;
    let osSpy: jest.ReplaceProperty<typeof Platform.OS>;

    beforeEach(() => {
      listeners = [];
      remove = jest.fn();
      osSpy = jest.replaceProperty(Platform, 'OS', 'android');
      addEventListenerSpy = jest
        .spyOn(BackHandler, 'addEventListener')
        .mockImplementation(((_event, handler) => {
          listeners.push(handler);
          return { remove };
        }) as typeof BackHandler.addEventListener);
    });

    afterEach(() => {
      addEventListenerSpy.mockRestore();
      osSpy.restore();
    });

    const pressBack = () => {
      let handled: boolean | null | undefined;
      act(() => {
        handled = listeners[listeners.length - 1]();
      });
      return handled;
    };

    const fireOpened = () =>
      act(() => mockBottomSheetControls.onAnimate?.(-1, 0));

    it('returns from the Exercise menu to the main menu', () => {
      const { ref, getByText, queryByText } = renderAddSheet();

      act(() => ref.current?.present());
      fireOpened();
      fireEvent.press(getByText('Exercise'));
      expect(getByText('Live sets & reps')).toBeTruthy();

      expect(pressBack()).toBe(true);

      expect(queryByText('Live sets & reps')).toBeNull();
      expect(getByText('Food')).toBeTruthy();
      expect(mockBottomSheetControls.dismiss).not.toHaveBeenCalled();
    });

    it('returns to the main menu when the sheet opened on the Exercise menu', () => {
      const { ref, getByText, queryByText } = renderAddSheet();

      act(() => ref.current?.present({ initialMenu: 'exercise' }));
      fireOpened();

      expect(pressBack()).toBe(true);

      expect(queryByText('Live sets & reps')).toBeNull();
      expect(getByText('Food')).toBeTruthy();
      expect(mockBottomSheetControls.dismiss).not.toHaveBeenCalled();
    });

    it('closes the sheet from the main menu, like tapping outside it', () => {
      const onDismissWithoutAction = jest.fn();
      const { ref } = renderAddSheet({ onDismissWithoutAction });

      act(() => ref.current?.present());
      fireOpened();

      expect(pressBack()).toBe(true);
      expect(mockBottomSheetControls.dismiss).toHaveBeenCalledTimes(1);

      act(() => mockBottomSheetControls.onDismiss?.());
      expect(onDismissWithoutAction).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalled();
    });

    it('takes Back when the open reports only onChange', () => {
      // With Android's "Remove animations" the open finishes before onAnimate
      // reaches JS and the library drops it; onChange still arrives.
      const { ref, getByText, queryByText } = renderAddSheet();

      act(() => ref.current?.present({ initialMenu: 'exercise' }));
      act(() => mockBottomSheetControls.onChange?.(0));
      expect(listeners).toHaveLength(1);

      expect(pressBack()).toBe(true);
      expect(queryByText('Live sets & reps')).toBeNull();
      expect(getByText('Food')).toBeTruthy();
    });

    it('only listens while the sheet is open', () => {
      const { ref } = renderAddSheet();

      act(() => ref.current?.present());
      expect(listeners).toHaveLength(0);

      fireOpened();
      expect(listeners).toHaveLength(1);

      act(() => mockBottomSheetControls.onDismiss?.());
      expect(remove).toHaveBeenCalled();
    });

    it('swallows Back while the sheet closes without changing its menu', () => {
      const { ref, props, getByText } = renderAddSheet();

      act(() => ref.current?.present({ initialMenu: 'exercise' }));
      fireOpened();
      fireEvent.press(getByText('Workout'));
      expect(props.onStartWorkout).toHaveBeenCalledTimes(1);
      expect(mockBottomSheetControls.dismiss).toHaveBeenCalledTimes(1);

      expect(pressBack()).toBe(true);

      expect(getByText('Live sets & reps')).toBeTruthy();
      expect(mockBottomSheetControls.dismiss).toHaveBeenCalledTimes(1);
    });
  });
});
