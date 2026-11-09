import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import LabelPhotoCropper from '../../src/components/LabelPhotoCropper';

describe('nutrition label crop review', () => {
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
});
