import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
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
  onAnimate: undefined as ((fromIndex: number, toIndex: number) => void) | undefined,
};

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    BottomSheetModal: React.forwardRef(
      ({ children, onDismiss, onAnimate }: any, ref) => {
        mockBottomSheetControls.onDismiss = onDismiss;
        mockBottomSheetControls.onAnimate = onAnimate;

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

describe('AddSheet', () => {
  let requestAnimationFrameSpy: jest.SpyInstance<number, [FrameRequestCallback]>;
  let cancelAnimationFrameSpy: jest.SpyInstance<void, [number]>;

  beforeEach(() => {
    jest.clearAllMocks();
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
    const ref = React.createRef<AddSheetRef>();

    render(
      <AddSheet
        ref={ref}
        onAddFood={jest.fn()}
        onAddWorkout={jest.fn()}
        onAddActivity={jest.fn()}
        onAddFromPreset={jest.fn()}
        onSyncHealthData={jest.fn()}
        onBarcodeScan={jest.fn()}
        onAddMeasurements={jest.fn()}
      />,
    );

    ref.current?.present();
    expect(mockBottomSheetControls.openCount).toBe(1);

    mockBottomSheetControls.isPresentBlocked = true;
    mockBottomSheetControls.onAnimate?.(0, -1);
    ref.current?.present();

    expect(mockBottomSheetControls.openCount).toBe(1);

    mockBottomSheetControls.isPresentBlocked = false;
    mockBottomSheetControls.onDismiss?.();

    expect(mockBottomSheetControls.openCount).toBe(2);
  });

  it('does not re-present after dismiss when no new present was requested', () => {
    const ref = React.createRef<AddSheetRef>();

    render(
      <AddSheet
        ref={ref}
        onAddFood={jest.fn()}
        onAddWorkout={jest.fn()}
        onAddActivity={jest.fn()}
        onAddFromPreset={jest.fn()}
        onSyncHealthData={jest.fn()}
        onBarcodeScan={jest.fn()}
        onAddMeasurements={jest.fn()}
      />,
    );

    ref.current?.present();
    expect(mockBottomSheetControls.openCount).toBe(1);

    mockBottomSheetControls.onAnimate?.(0, -1);
    mockBottomSheetControls.onDismiss?.();

    expect(mockBottomSheetControls.openCount).toBe(1);
  });

  it('renders the Measurements tile in the main grid', () => {
    const ref = React.createRef<AddSheetRef>();

    const { getByText } = render(
      <AddSheet
        ref={ref}
        onAddFood={jest.fn()}
        onAddWorkout={jest.fn()}
        onAddActivity={jest.fn()}
        onAddFromPreset={jest.fn()}
        onSyncHealthData={jest.fn()}
        onBarcodeScan={jest.fn()}
        onAddMeasurements={jest.fn()}
      />,
    );

    ref.current?.present();
    expect(getByText('Measurements')).toBeTruthy();
  });

  it('invokes onSyncHealthData when the secondary Sync Health Data row is pressed', () => {
    const ref = React.createRef<AddSheetRef>();
    const onSyncHealthData = jest.fn();

    const { getByText } = render(
      <AddSheet
        ref={ref}
        onAddFood={jest.fn()}
        onAddWorkout={jest.fn()}
        onAddActivity={jest.fn()}
        onAddFromPreset={jest.fn()}
        onSyncHealthData={onSyncHealthData}
        onBarcodeScan={jest.fn()}
        onAddMeasurements={jest.fn()}
      />,
    );

    ref.current?.present();
    fireEvent.press(getByText('Sync Health Data'));

    expect(onSyncHealthData).toHaveBeenCalledTimes(1);
  });
});
