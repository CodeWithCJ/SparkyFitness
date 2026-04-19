import React from 'react';
import { render } from '@testing-library/react-native';
import AddSheet, { type AddSheetRef } from '../../src/components/AddSheet';

const mockBottomSheetControls = {
  present: jest.fn(),
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockBottomSheetControls.onDismiss = undefined;
    mockBottomSheetControls.onAnimate = undefined;
  });

  it('re-presents after dismiss if present is requested during close animation', () => {
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
      />,
    );

    ref.current?.present();
    expect(mockBottomSheetControls.present).toHaveBeenCalledTimes(1);

    mockBottomSheetControls.onAnimate?.(0, -1);
    ref.current?.present();

    expect(mockBottomSheetControls.present).toHaveBeenCalledTimes(1);

    mockBottomSheetControls.onDismiss?.();

    expect(mockBottomSheetControls.present).toHaveBeenCalledTimes(2);
  });
});
