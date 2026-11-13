import React from 'react';
import { render } from '@testing-library/react-native';
import type { AdherenceDay, AdherenceSummary } from '@workspace/shared';
import AdherenceOverviewCard from '../../../src/components/medications/AdherenceOverviewCard';

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map((k) => `var(${k})`) : `var(${keys})`,
}));

jest.mock('../../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('../../../src/components/ProgressRing', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ progress, color }: { progress: number; color: string }) => (
      <View testID="ring" accessibilityLabel={`${progress}|${color}`} />
    ),
  };
});

function buildDays(overrides: Record<number, Partial<AdherenceDay>> = {}) {
  return Array.from({ length: 14 }, (_, i): AdherenceDay => {
    const date = `2026-10-${String(i + 1).padStart(2, '0')}`;
    return { date, due: 3, taken: 3, prnTaken: 0, pct: 100, ...overrides[i] };
  });
}

function buildSummary(
  overrides: Partial<AdherenceSummary> = {}
): AdherenceSummary {
  return {
    due: 42,
    taken: 39,
    perfectDays: 13,
    days: buildDays({ 6: { taken: 2, pct: 67 } }),
    streak: 13,
    pct: 93,
    ...overrides,
  };
}

describe('AdherenceOverviewCard', () => {
  it('shows the three stat tiles', () => {
    const screen = render(
      <AdherenceOverviewCard
        summary={buildSummary()}
        dosesCompleted={2}
        dosesTotal={3}
        isToday
      />
    );
    expect(screen.getByText('Adherence overview')).toBeTruthy();
    expect(screen.getByText('2/3')).toBeTruthy();
    expect(screen.getByText('Doses today')).toBeTruthy();
    expect(screen.getByText('14-day adherence')).toBeTruthy();
    expect(screen.getByText('Perfect days (14d)')).toBeTruthy();
    expect(screen.getByText('13')).toBeTruthy();
  });

  it('labels the doses tile without "today" on another day', () => {
    const screen = render(
      <AdherenceOverviewCard
        summary={buildSummary()}
        dosesCompleted={1}
        dosesTotal={2}
        isToday={false}
      />
    );
    expect(screen.getByText('Doses')).toBeTruthy();
    expect(screen.queryByText('Doses today')).toBeNull();
  });

  it('draws the ring at the adherence fraction with the percentage inside', () => {
    const screen = render(
      <AdherenceOverviewCard
        summary={buildSummary({ pct: 93 })}
        dosesCompleted={0}
        dosesTotal={0}
        isToday
      />
    );
    expect(screen.getByTestId('ring').props.accessibilityLabel).toBe(
      '0.93|var(--color-icon-success)'
    );
    expect(screen.getAllByText('93%').length).toBeGreaterThan(0);
  });

  it.each([
    [95, 'var(--color-icon-success)'],
    [80, 'var(--color-icon-warning)'],
    [40, 'var(--color-icon-danger)'],
  ])('colours the ring for %i%% adherence', (pct, color) => {
    const screen = render(
      <AdherenceOverviewCard
        summary={buildSummary({ pct })}
        dosesCompleted={0}
        dosesTotal={0}
        isToday
      />
    );
    expect(screen.getByTestId('ring').props.accessibilityLabel).toBe(
      `${pct / 100}|${color}`
    );
  });

  it('renders one bar per day coloured by completion, with the streak', () => {
    const days = buildDays({
      0: { due: 0, taken: 0, prnTaken: 0, pct: -1 },
      1: { taken: 2, pct: 67 },
      2: { taken: 1, pct: 33 },
      3: { taken: 0, pct: 0 },
    });
    const screen = render(
      <AdherenceOverviewCard
        summary={buildSummary({ days })}
        dosesCompleted={3}
        dosesTotal={3}
        isToday
      />
    );
    expect(screen.getByText('Last 14 days')).toBeTruthy();
    expect(screen.getByText('13-day streak')).toBeTruthy();
    expect(screen.getByTestId('adherence-bar-2026-10-01-idle')).toBeTruthy();
    expect(screen.getByTestId('adherence-bar-2026-10-02-partial')).toBeTruthy();
    expect(screen.getByTestId('adherence-bar-2026-10-03-low')).toBeTruthy();
    expect(screen.getByTestId('adherence-bar-2026-10-04-missed')).toBeTruthy();
    expect(screen.getByTestId('adherence-bar-2026-10-05-full')).toBeTruthy();
    expect(screen.getAllByTestId(/^adherence-bar-/)).toHaveLength(14);
  });

  it('describes each bar for screen readers', () => {
    const days = buildDays({
      0: { due: 0, taken: 0, prnTaken: 2, pct: 100 },
      1: { due: 0, taken: 0, prnTaken: 0, pct: -1 },
    });
    const screen = render(
      <AdherenceOverviewCard
        summary={buildSummary({ days })}
        dosesCompleted={0}
        dosesTotal={0}
        isToday
      />
    );
    expect(screen.getByLabelText('2026-10-01: 2 as-needed doses')).toBeTruthy();
    expect(screen.getByLabelText('2026-10-02: no doses')).toBeTruthy();
    expect(screen.getByLabelText('2026-10-03: 3 of 3 taken')).toBeTruthy();
  });

  it('hides the streak when there is none', () => {
    const screen = render(
      <AdherenceOverviewCard
        summary={buildSummary({ streak: 0 })}
        dosesCompleted={0}
        dosesTotal={0}
        isToday
      />
    );
    expect(screen.queryByText(/-day streak/)).toBeNull();
  });
});
