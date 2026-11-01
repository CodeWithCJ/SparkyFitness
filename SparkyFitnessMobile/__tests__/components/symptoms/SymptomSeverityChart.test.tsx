import React from 'react';
import { render, screen } from '@testing-library/react-native';
import SymptomSeverityChart from '../../../src/components/symptoms/SymptomSeverityChart';
import type { SeverityChartInput } from '../../../src/utils/symptomReport';

const episode: SeverityChartInput = {
  started_at: '2026-10-01T10:00:00.000Z',
  logged_at: '2026-10-01T10:00:00.000Z',
  ended_at: '2026-10-01T12:00:00.000Z',
  severity: 2,
  severity_timeline: [
    { at: '2026-10-01T10:00:00.000Z', severity: 8 },
    { at: '2026-10-01T12:00:00.000Z', severity: 2 },
  ],
  treatments: [],
};

describe('SymptomSeverityChart', () => {
  it('draws the recorded effect as a band with a legend', () => {
    render(
      <SymptomSeverityChart
        entry={{
          ...episode,
          impact: 'mild',
          impact_timeline: [
            { at: '2026-10-01T10:00:00.000Z', impact: 'severe' },
            { at: '2026-10-01T11:00:00.000Z', impact: 'mild' },
          ],
        }}
        max={10}
      />
    );

    expect(screen.getByTestId('impact-band-severe')).toBeTruthy();
    expect(screen.getByTestId('impact-band-mild')).toBeTruthy();
    expect(screen.getByText('Impact on Day')).toBeTruthy();
    expect(screen.getByText('Moderate')).toBeTruthy();
    const label = screen.getByRole('image').props.accessibilityLabel;
    expect(label).toContain('Impact on Day: Severe');
    expect(label).toContain(', Mild');
  });

  it('shows the current effect when the server sends no timeline', () => {
    render(
      <SymptomSeverityChart
        entry={{ ...episode, impact: 'moderate' }}
        max={10}
      />
    );

    expect(screen.getByTestId('impact-band-moderate')).toBeTruthy();
  });

  it('draws no band or legend without a recorded effect', () => {
    render(<SymptomSeverityChart entry={episode} max={10} />);

    expect(screen.queryByTestId(/^impact-band-/)).toBeNull();
    expect(screen.queryByText('Impact on Day')).toBeNull();
    expect(screen.getByRole('image').props.accessibilityLabel).not.toContain(
      'Impact on Day'
    );
  });
});
