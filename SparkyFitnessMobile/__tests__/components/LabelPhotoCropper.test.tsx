import React, { useState } from 'react';
import {
  PanResponder,
  PixelRatio,
  StyleSheet,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import LabelPhotoCropper from '../../src/components/LabelPhotoCropper';
import type { LabelCrop } from '../../src/utils/labelCrop';

const photo = { uri: 'file:///label.jpg', width: 4000, height: 3000 };
const initialCrop = { x: 0.2, y: 0.2, width: 0.5, height: 0.5 };
type Screen = ReturnType<typeof render>;
type ResponderSpy = jest.SpyInstance<
  ReturnType<typeof PanResponder.create>,
  Parameters<typeof PanResponder.create>
>;

function EditableCrop({ crop: initial = initialCrop }: { crop?: LabelCrop }) {
  const [crop, setCrop] = useState(initial);
  return <LabelPhotoCropper photo={photo} crop={crop} onCropChange={setCrop} />;
}

function layoutCropper(screen: Screen) {
  fireEvent(screen.getByTestId('label-photo-cropper'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 600 } },
  });
}

function responderFor(screen: Screen, label: string, spy: ResponderSpy) {
  const control = screen.getByLabelText(label);
  const index = spy.mock.results.findIndex((result) => {
    if (result.type !== 'return') return false;
    const responder = result.value as ReturnType<typeof PanResponder.create>;
    return (
      responder.panHandlers.onResponderGrant === control.props.onResponderGrant
    );
  });
  const config = spy.mock.calls[index]?.[0];
  if (!config) throw new Error(`No responder registered for ${label}`);
  return config;
}

function gesture(dx = 0, dy = 0): PanResponderGestureState {
  return {
    stateID: 1,
    moveX: dx,
    moveY: dy,
    x0: 0,
    y0: 0,
    dx,
    dy,
    vx: 0,
    vy: 0,
    numberActiveTouches: 1,
    _accountsForMovesUpTo: 0,
  };
}

function expectCrop(screen: Screen, crop: LabelCrop) {
  const image = screen.getByTestId('label-crop-image-frame').props.style as {
    width: number;
    height: number;
  };
  const topLeft = StyleSheet.flatten(
    screen.getByLabelText('Top left crop handle').props.style
  );
  const bottomRight = StyleSheet.flatten(
    screen.getByLabelText('Bottom right crop handle').props.style
  );
  expect(topLeft.left).toBeCloseTo(crop.x * image.width - 22);
  expect(topLeft.top).toBeCloseTo(crop.y * image.height - 22);
  expect(bottomRight.left).toBeCloseTo(
    (crop.x + crop.width) * image.width - 22
  );
  expect(bottomRight.top).toBeCloseTo(
    (crop.y + crop.height) * image.height - 22
  );
}

describe('nutrition label crop review', () => {
  afterEach(() => jest.restoreAllMocks());

  it('shows the whole image within the available preview area', () => {
    const screen = render(
      <LabelPhotoCropper
        photo={{ uri: 'file:///label.jpg', width: 4000, height: 3000 }}
        crop={{ x: 0, y: 0, width: 1, height: 1 }}
        onCropChange={jest.fn()}
      />
    );
    fireEvent(screen.getByTestId('label-photo-cropper'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 600 } },
    });
    expect(
      screen.getByLabelText('Nutrition label photo').props.resizeMode
    ).toBe('contain');
    expect(screen.getByTestId('label-crop-image-frame').props.style).toEqual(
      expect.objectContaining({ width: 352, height: 264 })
    );
  });

  it('lets accessibility actions resize the selected label area', () => {
    const onCropChange = jest.fn();
    const screen = render(
      <LabelPhotoCropper
        photo={{ uri: 'file:///label.jpg', width: 3000, height: 4000 }}
        crop={{ x: 0, y: 0, width: 1, height: 1 }}
        onCropChange={onCropChange}
      />
    );
    fireEvent(screen.getByTestId('label-photo-cropper'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 600 } },
    });
    fireEvent(
      screen.getByLabelText('Bottom right crop handle'),
      'accessibilityAction',
      {
        nativeEvent: { actionName: 'left' },
      }
    );
    expect(onCropChange).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      width: 0.95,
      height: 1,
    });
  });

  it.each([
    { actionName: 'increment', width: 0.55 },
    { actionName: 'decrement', width: 0.45 },
  ])(
    'handles the standard $actionName adjustment gesture',
    ({ actionName, width }) => {
      const onCropChange = jest.fn();
      const screen = render(
        <LabelPhotoCropper
          photo={photo}
          crop={initialCrop}
          onCropChange={onCropChange}
        />
      );
      layoutCropper(screen);
      const control = screen.getByLabelText('Bottom right crop handle');
      expect(control.props.accessibilityActions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'increment' }),
          expect.objectContaining({ name: 'decrement' }),
        ])
      );
      fireEvent(control, 'accessibilityAction', {
        nativeEvent: { actionName },
      });
      expect(onCropChange).toHaveBeenLastCalledWith({
        ...initialCrop,
        width: expect.closeTo(width),
        height: expect.closeTo(initialCrop.height),
      });
    }
  );

  it('moves from the drag origin and starts the next drag at the updated crop', () => {
    const create = jest.spyOn(PanResponder, 'create');
    const screen = render(<EditableCrop />);
    layoutCropper(screen);
    const image = screen.getByTestId('label-crop-image-frame').props.style as {
      width: number;
      height: number;
    };
    const pan = responderFor(screen, 'Move label crop', create);
    const event = {} as GestureResponderEvent;
    act(() => pan.onPanResponderGrant?.(event, gesture()));
    act(() =>
      pan.onPanResponderMove?.(
        event,
        gesture(image.width * 0.1, image.height * 0.1)
      )
    );
    expectCrop(screen, { ...initialCrop, x: 0.3, y: 0.3 });
    act(() =>
      pan.onPanResponderMove?.(
        event,
        gesture(image.width * 0.15, image.height * 0.2)
      )
    );
    expectCrop(screen, { ...initialCrop, x: 0.35, y: 0.4 });
    act(() => pan.onPanResponderGrant?.(event, gesture()));
    act(() =>
      pan.onPanResponderMove?.(
        event,
        gesture(-image.width * 0.1, image.height * 0.05)
      )
    );
    expectCrop(screen, { ...initialCrop, x: 0.25, y: 0.45 });
  });

  it('keeps a full-size move target outside the corner controls for tiny crops', () => {
    const create = jest.spyOn(PanResponder, 'create');
    const crop = { x: 0.25, y: 0.25, width: 0.05, height: 0.05 };
    const screen = render(<EditableCrop crop={crop} />);
    layoutCropper(screen);
    const frame = screen.getByTestId('label-crop-image-frame');
    expect(within(frame).queryByLabelText('Move label crop')).toBeNull();
    expect(within(frame).getAllByRole('adjustable')).toHaveLength(4);
    const move = within(
      screen.getByTestId('label-crop-move-area')
    ).getByLabelText('Move label crop');
    expect(StyleSheet.flatten(move.props.style)).toEqual(
      expect.objectContaining({ width: 44, height: 44 })
    );
    expect(
      StyleSheet.flatten(screen.getByTestId('label-crop-move-area').props.style)
        .marginTop
    ).toBeGreaterThan(22);
    const image = frame.props.style as { width: number; height: number };
    const pan = responderFor(screen, 'Move label crop', create);
    const event = {} as GestureResponderEvent;
    act(() => pan.onPanResponderGrant?.(event, gesture()));
    act(() =>
      pan.onPanResponderMove?.(
        event,
        gesture(image.width * 0.1, image.height * 0.1)
      )
    );
    expectCrop(screen, { ...crop, x: 0.35, y: 0.35 });
  });

  it.each([
    { label: 'exactly the handle size', extent: 44 },
    { label: 'a rounded subpixel gap', extent: 44 + 0.5 / PixelRatio.get() },
  ])('keeps the separate move target at $label', ({ extent }) => {
    const screen = render(
      <EditableCrop
        crop={{ x: 0.2, y: 0.2, width: extent / 352, height: extent / 264 }}
      />
    );
    layoutCropper(screen);
    expect(
      within(screen.getByTestId('label-crop-image-frame')).queryByLabelText(
        'Move label crop'
      )
    ).toBeNull();
    expect(
      within(screen.getByTestId('label-crop-move-area')).getByLabelText(
        'Move label crop'
      )
    ).toBeTruthy();
  });
});
