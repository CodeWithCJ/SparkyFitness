import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { presetInventory } from '@workspace/shared';
import PlateBarGraphic from '../../src/components/PlateBarGraphic';
import { usePlateInventory } from '../../src/hooks/usePlateInventory';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/hooks/usePlateInventory', () => ({
  usePlateInventory: jest.fn(),
}));

const mockInventory = (inventory = presetInventory('kg')) =>
  jest.mocked(usePlateInventory).mockReturnValue({
    inventory,
    hasSaved: false,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof usePlateInventory>);

beforeAll(async () => {
  await initializeI18n('en');
});
beforeEach(() => mockInventory());

describe('PlateBarGraphic', () => {
  it('draws the bar and the plates for one side', () => {
    render(
      <PlateBarGraphic
        targetWeight={100}
        weightUnit="kg"
        equipment={['barbell']}
      />
    );
    expect(screen.getByLabelText('40 kg per side on a 20 kg bar')).toBeTruthy();
    expect(screen.getByText('25')).toBeTruthy();
    expect(screen.getByText('15')).toBeTruthy();
  });

  it('repeats a plate that is used twice', () => {
    render(
      <PlateBarGraphic
        targetWeight={140}
        weightUnit="kg"
        equipment={['barbell']}
      />
    );
    expect(screen.getAllByText('25')).toHaveLength(2);
  });

  it('never draws a weight the plates cannot make', () => {
    render(
      <PlateBarGraphic
        targetWeight={20.5}
        weightUnit="kg"
        equipment={['barbell']}
      />
    );
    expect(screen.queryByLabelText(/per side on a/)).toBeNull();
    expect(screen.getByText('Plates: nearest 20 kg')).toBeTruthy();
  });

  it('says so when the weight is under the bar', () => {
    render(
      <PlateBarGraphic
        targetWeight={15}
        weightUnit="kg"
        equipment={['barbell']}
      />
    );
    expect(screen.getByText('Plates: lighter than the bar')).toBeTruthy();
  });

  it('works in pounds', () => {
    mockInventory(presetInventory('lbs'));
    render(
      <PlateBarGraphic
        targetWeight={135}
        weightUnit="lbs"
        equipment={['barbell']}
      />
    );
    expect(
      screen.getByLabelText('45 lbs per side on a 45 lbs bar')
    ).toBeTruthy();
  });
});
