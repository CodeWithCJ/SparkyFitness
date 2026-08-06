import React from 'react';
import { Image } from 'expo-image';
import { render } from '@testing-library/react-native';
import SafeImage from '../../src/components/SafeImage';

const source = { uri: 'https://server/uploads/exercises/demo/0.gif', headers: {} };

describe('SafeImage autoplay', () => {
  it('holds animated formats on their first frame by default', () => {
    // Regression: animated GIF exercise images used to loop inside list
    // thumbnails everywhere SafeImage is used, because expo-image autoplays
    // unless told otherwise.
    const { UNSAFE_getByType } = render(
      <SafeImage source={source} style={{ width: 42, height: 42 }} />,
    );

    expect(UNSAFE_getByType(Image).props.autoplay).toBe(false);
  });

  it('plays animated formats when the caller opts in', () => {
    const { UNSAFE_getByType } = render(
      <SafeImage source={source} style={{ width: 42, height: 42 }} autoplay />,
    );

    expect(UNSAFE_getByType(Image).props.autoplay).toBe(true);
  });
});
