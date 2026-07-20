import React from 'react';
import { render } from '@testing-library/react-native';
import CycleRing from '../../../src/components/wellness/CycleRing';




describe('CycleRing', () => {
  it('renders correctly with day and labels', () => {
    const { getByText } = render(
      <CycleRing
        cycleDay={5}
        cycleLength={28}
        periodLength={5}
        fertileStartDay={12}
        fertileEndDay={16}
        ovulationDay={14}
        centerLabel="Period"
        centerValue="Day 5"
        centerSub="28 day cycle"
      />,
    );

    expect(getByText('Period')).toBeTruthy();
    expect(getByText('Day 5')).toBeTruthy();
    expect(getByText('28 day cycle')).toBeTruthy();
  });
});
