import React from 'react';
import { render } from '@testing-library/react-native';
import NutrientPill from '../../src/components/NutrientPill';

describe('NutrientPill', () => {
  it('renders label and consumed/goal/unit text', () => {
    const { getByText } = render(
      <NutrientPill label="Protein" consumed={34} goal={97} />,
    );
    expect(getByText('Protein')).toBeTruthy();
    expect(getByText(/34\/97g/)).toBeTruthy();
  });

  it('omits the goal suffix when goal is undefined', () => {
    const { getByText } = render(
      <NutrientPill label="Protein" consumed={34} />,
    );
    expect(getByText(/^34g/)).toBeTruthy();
  });

  it('omits the goal suffix when goal is zero', () => {
    const { getByText } = render(
      <NutrientPill label="Protein" consumed={34} goal={0} />,
    );
    expect(getByText(/^34g/)).toBeTruthy();
  });

  it('defaults unit to "g" when not provided', () => {
    const { getByText } = render(
      <NutrientPill label="Protein" consumed={34} goal={97} />,
    );
    expect(getByText(/34\/97g/)).toBeTruthy();
  });

  it('uses a custom unit when provided', () => {
    const { getByText } = render(
      <NutrientPill label="Omega-3" consumed={200} goal={500} unit="mg" />,
    );
    expect(getByText(/200\/500mg/)).toBeTruthy();
  });

  it('rounds consumed and goal values', () => {
    const { getByText } = render(
      <NutrientPill label="Protein" consumed={34.6} goal={96.7} />,
    );
    expect(getByText(/35\/97g/)).toBeTruthy();
  });
});
