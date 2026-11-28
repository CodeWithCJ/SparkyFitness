import React from 'react';
import { render } from '@testing-library/react-native';
import BodyweightBanner from '../../src/components/BodyweightBanner';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

describe('BodyweightBanner', () => {
  it('names the body weight it counts, in kg', () => {
    const { getByTestId, getByText } = render(
      <BodyweightBanner bodyWeightKg={80} weightUnit="kg" />
    );
    expect(getByTestId('bodyweight-banner')).toBeTruthy();
    expect(
      getByText(
        'Bodyweight exercise: counts your body weight (80 kg) plus the weight you enter. Use a minus sign for assistance.'
      )
    ).toBeTruthy();
  });

  it('converts the body weight for a lbs user', () => {
    const { getByText } = render(
      <BodyweightBanner bodyWeightKg={80} weightUnit="lbs" />
    );
    expect(getByText(/\(176\.4 lbs\)/)).toBeTruthy();
  });

  it('asks for a body weight when none is logged', () => {
    const { getByText } = render(
      <BodyweightBanner bodyWeightKg={null} weightUnit="kg" />
    );
    expect(
      getByText(/Log a body weight so volume can be calculated/)
    ).toBeTruthy();
  });
});
