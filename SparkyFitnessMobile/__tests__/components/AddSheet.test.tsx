import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import AddSheet, { type AddSheetRef } from '../../src/components/AddSheet';

const enResource = require('../../src/localization/locales/en/translation.json');
const plResource = require('../../src/localization/locales/pl/translation.json');
(globalThis as any).__I18N_EN = enResource;
(globalThis as any).__I18N_PL = plResource;
(globalThis as any).__I18N_LANG = 'en';

jest.mock('react-i18next', () => {
  const actual = jest.requireActual('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => {
        const resources = (globalThis.__I18N_LANG === 'pl' ? globalThis.__I18N_PL : globalThis.__I18N_EN) ?? {};
        return key.split('.').reduce((value: unknown, part: string) => {
          if (value && typeof value === 'object' && part in value) {
            return (value as Record<string, unknown>)[part];
          }
          return undefined;
        }, resources) ?? key;
      },
      i18n: null,
      ready: true,
    }),
  };
});

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
  onAnimate: undefined as ((fromIndex: number, toIndex: number) => void) | undefined,
};

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    BottomSheetModal: React.forwardRef(
      ({ children, onDismiss, onAnimate }: any, ref) => {
        // Test mock stashes the latest handlers for assertions; writing to the
        // module-scoped controls during the mock's render is intentional.
        /* eslint-disable react-hooks/immutability */
        mockBottomSheetControls.onDismiss = onDismiss;
        mockBottomSheetControls.onAnimate = onAnimate;
        /* eslint-enable react-hooks/immutability */

        React.useImperativeHandle(ref, () => ({
          present: mockBottomSheetControls.present,
          dismiss: mockBottomSheetControls.dismiss,
        }));

        return React.createElement(View, { testID: 'add-sheet-modal' }, children);
      },
    ),
    BottomSheetView: ({ children }: any) => React.createElement(View, null, children),
    BottomSheetBackdrop: () => null,
  };
});

function renderAddSheet(overrides: Partial<React.ComponentProps<typeof AddSheet>> = {}) {
  const ref = React.createRef<AddSheetRef>();
  const props = {
    onAddFood: jest.fn(),
    onStartWorkout: jest.fn(),
    onAddActivity: jest.fn(),
    onLogWorkout: jest.fn(),
    onSyncHealthData: jest.fn(),
    onBarcodeScan: jest.fn(),
    onAddMeasurements: jest.fn(),
    onAskSparky: jest.fn(),
    ...overrides,
  };
  const utils = render(<AddSheet ref={ref} {...props} />);
  return { ref, props, ...utils };
}

describe('AddSheet', () => {
  let requestAnimationFrameSpy: jest.SpyInstance<number, [FrameRequestCallback]>;
  let cancelAnimationFrameSpy: jest.SpyInstance<void, [number]>;

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as any).__I18N_LANG = 'en';
    mockBottomSheetControls.openCount = 0;
    mockBottomSheetControls.isPresentBlocked = false;
    mockBottomSheetControls.onDismiss = undefined;
    mockBottomSheetControls.onAnimate = undefined;
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

  it('invokes onSyncHealthData when the secondary Sync Health Data row is pressed', () => {
    const onSyncHealthData = jest.fn();
    const onDismissWithoutAction = jest.fn();
    const { ref, getByText } = renderAddSheet({ onSyncHealthData, onDismissWithoutAction });

    act(() => ref.current?.present());
    fireEvent.press(getByText('Sync Health Data'));
    act(() => mockBottomSheetControls.onDismiss?.());

    expect(onSyncHealthData).toHaveBeenCalledTimes(1);
    expect(onDismissWithoutAction).not.toHaveBeenCalled();
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

  it('fires onLogWorkout from the Log Workout submenu option', () => {
    const { ref, props, getByText } = renderAddSheet();

    act(() => ref.current?.present({ initialMenu: 'exercise' }));
    fireEvent.press(getByText('Log Workout'));

    expect(props.onLogWorkout).toHaveBeenCalledTimes(1);
    expect(props.onStartWorkout).not.toHaveBeenCalled();
  });

  it.each([
    ['en', 'Back'],
    ['pl', 'Cofnij'],
  ] as const)('shows the localized back action in the %s exercise submenu', (language, label) => {
    (globalThis as any).__I18N_LANG = language;
    const { ref, getByText, queryByText } = renderAddSheet();

    act(() => ref.current?.present({ initialMenu: 'exercise' }));

    expect(getByText(label)).toBeTruthy();
    expect(queryByText(['Ple', 'cy'].join(''))).toBeNull();
  });

  it.each([
    ['en', 'Wellness'],
    ['pl', 'Samopoczucie'],
  ] as const)('uses the localized Wellness fallback in %s', (language, label) => {
    (globalThis as any).__I18N_LANG = language;
    const { ref, getByText } = renderAddSheet({
      showCycleCard: true,
      onOpenCycle: jest.fn(),
      cycleLabel: undefined,
    });

    act(() => ref.current?.present());

    expect(getByText(label)).toBeTruthy();
  });

  it.each(['en', 'pl'] as const)('keeps a custom cycle label literal in %s', (language) => {
    (globalThis as any).__I18N_LANG = language;
    const onOpenCycle = jest.fn();
    const { ref, getByText } = renderAddSheet({
      showCycleCard: true,
      onOpenCycle,
      cycleLabel: 'Moja sekcja',
    });

    act(() => ref.current?.present());
    fireEvent.press(getByText('Moja sekcja'));

    expect(getByText('Moja sekcja')).toBeTruthy();
    expect(onOpenCycle).toHaveBeenCalledTimes(1);
  });
});
