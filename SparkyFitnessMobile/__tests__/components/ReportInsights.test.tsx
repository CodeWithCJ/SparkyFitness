import React from 'react';
import { render } from '@testing-library/react-native';

import ReportInsights from '../../src/components/reports/ReportInsights';
import { initializeI18n } from '../../src/localization/i18n';

describe('ReportInsights', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('shows the lines it is given', () => {
    const { getByText, getByTestId } = render(
      <ReportInsights
        lines={['You slept longer on weekends.', 'Streak of 4 days.']}
        testIDPrefix="sleep"
      />
    );
    expect(getByText('What stood out')).toBeTruthy();
    expect(getByTestId('sleep-insight-0')).toBeTruthy();
    expect(getByText('Streak of 4 days.')).toBeTruthy();
  });

  it('renders nothing without lines', () => {
    const { queryByText } = render(
      <ReportInsights lines={[]} testIDPrefix="sleep" />
    );
    expect(queryByText('What stood out')).toBeNull();
  });

  it('keeps to four lines', () => {
    const { queryByTestId } = render(
      <ReportInsights lines={['a', 'b', 'c', 'd', 'e', 'f']} testIDPrefix="x" />
    );
    expect(queryByTestId('x-insight-3')).toBeTruthy();
    expect(queryByTestId('x-insight-4')).toBeNull();
  });
});
