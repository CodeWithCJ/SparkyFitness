import React from 'react';
import { Image } from 'expo-image';
import { fireEvent, render } from '@testing-library/react-native';
import FoodThumbnail from '../../src/components/FoodThumbnail';

const getImageSource = (path: string) => ({
  uri: `https://server/api${path}`,
  headers: {},
});

describe('FoodThumbnail', () => {
  it('renders the resolved image for a stored path', () => {
    const { UNSAFE_getByType } = render(
      <FoodThumbnail
        image="/uploads/foods/abc/1.jpg"
        getImageSource={getImageSource}
      />,
    );

    expect(UNSAFE_getByType(Image).props.source).toEqual({
      uri: 'https://server/api/uploads/foods/abc/1.jpg',
      headers: {},
    });
  });

  it('renders a placeholder box when there is no image', () => {
    const { queryByTestId } = render(
      <FoodThumbnail image={null} getImageSource={getImageSource} />,
    );

    expect(queryByTestId('food-thumbnail')).not.toBeNull();
  });

  it('renders nothing at all when fallbacks are suppressed', () => {
    // The diary row opts out: reserving a placeholder for every entry would
    // make a photo-free day taller than it was before images existed.
    const { queryByTestId } = render(
      <FoodThumbnail
        image={null}
        getImageSource={getImageSource}
        showFallback={false}
      />,
    );

    expect(queryByTestId('food-thumbnail')).toBeNull();
  });

  it('still renders when an image is present and fallbacks are suppressed', () => {
    const { queryByTestId } = render(
      <FoodThumbnail
        image="/uploads/foods/abc/1.jpg"
        getImageSource={getImageSource}
        showFallback={false}
      />,
    );

    expect(queryByTestId('food-thumbnail')).not.toBeNull();
  });
});

describe('FoodThumbnail interactivity', () => {
  it('is pressable when a handler is supplied', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <FoodThumbnail
        image="/uploads/foods/abc/1.jpg"
        getImageSource={getImageSource}
        onPress={onPress}
      />,
    );

    fireEvent.press(getByTestId('food-thumbnail'));
    expect(onPress).toHaveBeenCalled();
  });

  it('stays inert when no handler is supplied', () => {
    // Rows without a viewer (e.g. the picker tiles) must not look tappable.
    const { getByTestId } = render(
      <FoodThumbnail
        image="/uploads/foods/abc/1.jpg"
        getImageSource={getImageSource}
      />,
    );

    expect(getByTestId('food-thumbnail').props.accessibilityRole).toBeUndefined();
  });
});
