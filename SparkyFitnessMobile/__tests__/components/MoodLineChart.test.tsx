import React from 'react';
import { render, screen } from '@testing-library/react-native';
import MoodLineChart from '../../src/components/MoodLineChart';
import { initializeI18n } from '../../src/localization/i18n';
import type { MoodDataPoint } from '../../src/hooks/useMood';

beforeAll(async () => {
  await initializeI18n('en');
});

const point: MoodDataPoint = { day: '2026-06-03', mood: 60 };

describe('MoodLineChart without a title (embedded in MoodHistoryCard)', () => {
  it('renders no title and the bare empty message', () => {
    render(
      <MoodLineChart data={[]} isLoading={false} isError={false} range="7d" />
    );

    expect(screen.getByText('No mood logged for this period')).toBeTruthy();
    expect(screen.queryByTestId('cartesian-chart')).toBeNull();
  });

  it('renders the bare error message', () => {
    render(<MoodLineChart data={[]} isLoading={false} isError range="7d" />);

    expect(screen.getByText('Failed to load mood data')).toBeTruthy();
  });

  it('renders the plot with no card title when data is present', () => {
    render(
      <MoodLineChart
        data={[point]}
        isLoading={false}
        isError={false}
        range="7d"
      />
    );

    expect(screen.getByTestId('cartesian-chart')).toBeTruthy();
    expect(screen.queryByText('Mood')).toBeNull();
  });
});

describe('MoodLineChart with a title (the Health Trends pager card)', () => {
  const title = 'Mood';

  it('renders the card title', () => {
    render(
      <MoodLineChart
        data={[point]}
        isLoading={false}
        isError={false}
        range="7d"
        title={title}
      />
    );

    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByTestId('cartesian-chart')).toBeTruthy();
  });

  it('shows the loading state', () => {
    render(
      <MoodLineChart
        data={[]}
        isLoading
        isError={false}
        range="7d"
        title={title}
      />
    );

    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('shows the card-mode error text', () => {
    render(
      <MoodLineChart
        data={[]}
        isLoading={false}
        isError
        range="7d"
        title={title}
      />
    );

    expect(screen.getByText('Failed to load mood data')).toBeTruthy();
  });

  it('shows the card-mode empty text', () => {
    render(
      <MoodLineChart
        data={[]}
        isLoading={false}
        isError={false}
        range="7d"
        title={title}
      />
    );

    expect(screen.getByText('No mood logged for this period')).toBeTruthy();
  });
});
