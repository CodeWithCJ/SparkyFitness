import React from 'react';
import { BackHandler, Platform } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import AddSheet, { type AddSheetRef } from '../../src/components/AddSheet';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';

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

  it('shows the rows in the saved order and leaves out hidden ones', () => {
    __resetAppPreferencesStoreForTests();
    useAppPreferencesStore.setState({
      addMenuOrder: ['syncHealth', 'askSparky'],
      hiddenAddMenuItems: ['progressPhotos'],
    });
    const { queryByText, toJSON } = renderAddSheet();

    expect(queryByText('Progress Photos')).toBeNull();
    const text = JSON.stringify(toJSON());
    // Saved rows first, then the rest in their usual order.
    expect(text.indexOf('Sync Health')).toBeLessThan(
      text.indexOf('Ask Sparky')
    );
    __resetAppPreferencesStoreForTests();
  });

  it('puts a chosen item on a big card and the old card in the rows', () => {
    __resetAppPreferencesStoreForTests();
    useAppPreferencesStore.setState({
      addMenuCards: ['askSparky', 'exercise', 'measurements', 'scanFood'],
    });
    const onAskSparky = jest.fn();
    const { getByText } = renderAddSheet({ onAskSparky });

    // Ask Sparky is a card now, Food is a row, and both still work.
    fireEvent.press(getByText('Ask Sparky'));
    expect(onAskSparky).toHaveBeenCalled();
    expect(getByText('Food')).toBeTruthy();
    __resetAppPreferencesStoreForTests();
  });

  it('shows an item as the style the person chose', () => {
    __resetAppPreferencesStoreForTests();
    useAppPreferencesStore.getState().setAddMenuRowStyle('symptoms', 'action');
    const onAddSymptoms = jest.fn();
    const { getByText } = renderAddSheet({ onAddSymptoms });

    // A button now, and it still works.
    fireEvent.press(getByText('Symptoms & Health'));
    expect(onAddSymptoms).toHaveBeenCalledTimes(1);
    __resetAppPreferencesStoreForTests();
  });

  it('opens the exercise sub-menu from a row', () => {
    __resetAppPreferencesStoreForTests();
    useAppPreferencesStore.setState({
      addMenuCards: ['food', 'mood', 'measurements', 'scanFood'],
    });
    const { getByText } = renderAddSheet({ onAddMood: jest.fn() });

    fireEvent.press(getByText('Exercise'));
    expect(getByText('Workout')).toBeTruthy();
    __resetAppPreferencesStoreForTests();
  });

  it('renders the quick action tiles with their short names', () => {
    const { ref, getByText } = renderAddSheet();

    act(() => ref.current?.present());
    expect(getByText('Quick Actions')).toBeTruthy();
    expect(getByText('Measure')).toBeTruthy();
    expect(getByText('Scan')).toBeTruthy();
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

  it('invokes onSyncHealthData when the Sync Health button is pressed', () => {
    const onSyncHealthData = jest.fn();
    const onDismissWithoutAction = jest.fn();
    const { ref, getByText } = renderAddSheet({
      onSyncHealthData,
      onDismissWithoutAction,
    });

    act(() => ref.current?.present());
    fireEvent.press(getByText('Sync Health'));
    act(() => mockBottomSheetControls.onDismiss?.());

    expect(onSyncHealthData).toHaveBeenCalledTimes(1);
    expect(onDismissWithoutAction).not.toHaveBeenCalled();
  });

  it('invokes onAddSymptoms when the Symptoms & Health row is pressed', () => {
    const onAddSymptoms = jest.fn();
    const onDismissWithoutAction = jest.fn();
    const { ref, getByText } = renderAddSheet({
      onAddSymptoms,
      onDismissWithoutAction,
    });

    act(() => ref.current?.present());
    fireEvent.press(getByText('Symptoms & Health'));
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

  it('dismisses from Done without counting as an action', () => {
    const onDismissWithoutAction = jest.fn();
    const { ref, getByText } = renderAddSheet({ onDismissWithoutAction });

    act(() => ref.current?.present());
    fireEvent.press(getByText('Done'));
    expect(mockBottomSheetControls.dismiss).toHaveBeenCalled();
    act(() => mockBottomSheetControls.onDismiss?.());

    expect(onDismissWithoutAction).toHaveBeenCalledTimes(1);
  });

  describe('guided check-in row', () => {
    it('shows with no setting to turn on, as soon as there is a handler', () => {
      const onStartCheckIn = jest.fn();
      const { ref, getByText } = renderAddSheet({ onStartCheckIn });

      act(() => ref.current?.present());

      expect(getByText('Daily Check-In')).toBeTruthy();
      expect(onStartCheckIn).not.toHaveBeenCalled();
    });

    it('is left out when hidden in Quick Actions, like any other item', () => {
      __resetAppPreferencesStoreForTests();
      useAppPreferencesStore.setState({ hiddenAddMenuItems: ['checkIn'] });
      const { ref, getByText, queryByText } = renderAddSheet({
        onStartCheckIn: jest.fn(),
      });

      act(() => ref.current?.present());

      expect(queryByText('Daily Check-In')).toBeNull();
      expect(getByText('Progress Photos')).toBeTruthy();
      __resetAppPreferencesStoreForTests();
    });

    it('shows the Check-In row before Progress Photos, first among the secondary rows', () => {
      const { ref, getAllByText } = renderAddSheet({
        onStartCheckIn: jest.fn(),
        onAddMood: jest.fn(),
      });

      act(() => ref.current?.present());

      const rowLabels = getAllByText(
        /^(Daily Check-In|Progress Photos|Mood)$/
      ).map((node) => node.props.children);
      expect(rowLabels).toEqual(['Daily Check-In', 'Progress Photos', 'Mood']);
    });

    it('invokes onStartCheckIn when the Check-In row is pressed', () => {
      const onStartCheckIn = jest.fn();
      const onAddMood = jest.fn();
      const onDismissWithoutAction = jest.fn();
      const { ref, getByText } = renderAddSheet({
        onStartCheckIn,
        onAddMood,
        onDismissWithoutAction,
      });

      act(() => ref.current?.present());
      fireEvent.press(getByText('Daily Check-In'));
      act(() => mockBottomSheetControls.onDismiss?.());

      expect(onStartCheckIn).toHaveBeenCalledTimes(1);
      expect(mockBottomSheetControls.dismiss).toHaveBeenCalledTimes(1);
      expect(onAddMood).not.toHaveBeenCalled();
      expect(onDismissWithoutAction).not.toHaveBeenCalled();
    });
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
