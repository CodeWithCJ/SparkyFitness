import React from 'react';
import { Image } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import ExerciseImageCrossfade, {
  sourceMayHaveTransparency,
} from '../../src/components/ExerciseImageCrossfade';

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
    const { UNSAFE_getAllByType } = render(
      <ExerciseImageCrossfade sources={[frameA, frameB]} />,
    );

    const images = UNSAFE_getAllByType(Image);
    expect(images).toHaveLength(2);
    expect(images[0].props.source).toEqual(frameA);
    expect(images[1].props.source).toEqual(frameB);
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
