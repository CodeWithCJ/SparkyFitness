import React from 'react';
import { render } from '@testing-library/react-native';

import ReportHighlights from '../../src/components/reports/ReportHighlights';

describe('ReportHighlights', () => {
  it('shows each figure with its label and a change when there is one', () => {
    const { getByText, queryByText } = render(
      <ReportHighlights
        items={[
          {
            label: 'Time asleep',
            value: '7.4 h',
            change: '+0.3 h',
            changeTone: 'positive',
          },
          { label: 'Efficiency', value: '91%' },
        ]}
      />
    );

    expect(getByText('Time asleep')).toBeTruthy();
    expect(getByText('7.4 h')).toBeTruthy();
    expect(getByText('+0.3 h')).toBeTruthy();
    expect(getByText('91%')).toBeTruthy();
    expect(queryByText('+0.3 h')?.props.className).toContain(
      'text-text-success'
    );
  });

  it('colors a worse change as a warning and a neutral one as muted', () => {
    const { getByText } = render(
      <ReportHighlights
        items={[
          { label: 'A', value: '1', change: '-2', changeTone: 'negative' },
          { label: 'B', value: '2', change: '+1%' },
        ]}
      />
    );

    expect(getByText('-2').props.className).toContain(
      'text-text-danger-subtle'
    );
    expect(getByText('+1%').props.className).toContain('text-text-muted');
  });
});
