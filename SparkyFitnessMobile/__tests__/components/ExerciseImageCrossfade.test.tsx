import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import ExerciseImageCrossfade, {
  sourceMayHaveTransparency,
} from '../../src/components/ExerciseImageCrossfade';
import SafeImage from '../../src/components/SafeImage';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: { name: string }) => <View testID={`icon-${props.name}`} />,
  };
});

const frameA = { uri: 'https://server/images/a.png', headers: { Authorization: 'Bearer t' } };
const frameB = { uri: 'https://server/images/b.png', headers: { Authorization: 'Bearer t' } };

describe('ExerciseImageCrossfade', () => {
  it('renders both frames stacked so the dissolve has both images loaded', () => {
    const fallback = <></>;
    const { UNSAFE_getAllByType } = render(
      <ExerciseImageCrossfade sources={[frameA, frameB]} fallback={fallback} />,
    );

    const images = UNSAFE_getAllByType(SafeImage);
    expect(images).toHaveLength(2);
    expect(images[0].props.source).toEqual(frameA);
    expect(images[1].props.source).toEqual(frameB);
    expect(images[0].props.fallback).toBe(fallback);
    expect(images[1].props.fallback).toBe(fallback);
    // The detail screen owns exercise animation, so its frames override
    // SafeImage's play-nothing default.
    expect(images[0].props.autoplay).toBe(true);
    expect(images[1].props.autoplay).toBe(true);
  });

  it('contains transparent-capable frames on a white backdrop and covers opaque JPEG frames', () => {
    const pngPair = render(
      <ExerciseImageCrossfade
        sources={[
          { uri: 'https://server/images/a.png', headers: {} },
          { uri: 'https://server/images/b.png', headers: {} },
        ]}
      />,
    );
    for (const image of pngPair.UNSAFE_getAllByType(SafeImage)) {
      expect(image.props.contentFit).toBe('contain');
    }
    expect(
      StyleSheet.flatten(pngPair.getByTestId('exercise-image-crossfade').props.style)
        .backgroundColor,
    ).toBe('#ffffff');

    const jpgPair = render(
      <ExerciseImageCrossfade
        sources={[
          { uri: 'https://server/images/a.jpg', headers: {} },
          { uri: 'https://server/images/b.jpg', headers: {} },
        ]}
      />,
    );
    for (const image of jpgPair.UNSAFE_getAllByType(SafeImage)) {
      expect(image.props.contentFit).toBe('cover');
    }
    expect(
      StyleSheet.flatten(jpgPair.getByTestId('exercise-image-crossfade').props.style)
        .backgroundColor,
    ).toBeUndefined();
  });

  it('toggles pause on tap and resumes on a second tap', () => {
    const { getByTestId, queryByTestId } = render(
      <ExerciseImageCrossfade sources={[frameA, frameB]} />,
    );

    expect(queryByTestId('exercise-image-crossfade-paused')).toBeNull();

    fireEvent.press(getByTestId('exercise-image-crossfade'));
    expect(queryByTestId('exercise-image-crossfade-paused')).not.toBeNull();

    fireEvent.press(getByTestId('exercise-image-crossfade'));
    expect(queryByTestId('exercise-image-crossfade-paused')).toBeNull();
  });
});

describe('sourceMayHaveTransparency', () => {
  it('treats JPEGs as opaque regardless of case or query string', () => {
    expect(sourceMayHaveTransparency('https://server/uploads/0.jpg')).toBe(false);
    expect(sourceMayHaveTransparency('https://server/uploads/0.JPEG')).toBe(false);
    expect(sourceMayHaveTransparency('https://server/uploads/0.jpg?token=abc')).toBe(
      false,
    );
  });

  it('treats alpha-capable and unknown formats as possibly transparent', () => {
    expect(sourceMayHaveTransparency('https://server/uploads/0.png')).toBe(true);
    expect(sourceMayHaveTransparency('https://server/uploads/0.webp')).toBe(true);
    expect(sourceMayHaveTransparency('https://cdn.example/image/12345')).toBe(true);
  });
});
