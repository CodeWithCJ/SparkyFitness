import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { RouteCue } from '@workspace/shared';
import RouteCueList, {
  listableRouteCues,
} from '../../src/components/RouteCueList';

const cues: RouteCue[] = [
  { index: 0, kind: 'depart', text: 'Head north on Elm St', distanceM: 0 },
  { index: 2, kind: 'straight', distanceM: 100 },
  { index: 4, kind: 'left', distanceM: 1200 },
  { index: 9, kind: 'sharp_right', text: '   ', distanceM: 2500 },
  { index: 12, kind: 'arrive', distanceM: 5000 },
];

describe('RouteCueList', () => {
  it('drops straight-on cues', () => {
    expect(listableRouteCues(cues).map((c) => c.kind)).toEqual([
      'depart',
      'left',
      'sharp_right',
      'arrive',
    ]);
  });

  it('numbers the turns with their text or kind and distance from the start', () => {
    const { getByText, queryByText } = render(
      <RouteCueList cues={cues} unit="km" />
    );
    expect(getByText('1.')).toBeTruthy();
    expect(getByText('Head north on Elm St')).toBeTruthy();
    expect(getByText('Turn left')).toBeTruthy();
    expect(getByText('1.20 km')).toBeTruthy();
    expect(getByText('Sharp right')).toBeTruthy();
    expect(getByText('4.')).toBeTruthy();
    expect(queryByText('Continue straight')).toBeNull();
  });

  it('shows distances in miles', () => {
    const { getByText } = render(<RouteCueList cues={cues} unit="miles" />);
    expect(getByText('0.75 mi')).toBeTruthy();
  });

  it('renders nothing for a route without cues', () => {
    const { toJSON } = render(<RouteCueList cues={[]} unit="km" />);
    expect(toJSON()).toBeNull();
  });

  it('collapses a long list and expands on request', () => {
    const many: RouteCue[] = Array.from({ length: 12 }, (_, i) => ({
      index: i,
      kind: 'left',
      distanceM: i * 100,
    }));
    const { getByText, queryByText } = render(
      <RouteCueList cues={many} unit="km" />
    );
    expect(queryByText('9.')).toBeNull();
    fireEvent.press(getByText('Show all 12 turns'));
    expect(getByText('12.')).toBeTruthy();
    fireEvent.press(getByText('Show fewer'));
    expect(queryByText('12.')).toBeNull();
  });
});
