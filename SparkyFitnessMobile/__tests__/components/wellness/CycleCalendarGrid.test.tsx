import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import CycleCalendarGrid from '../../../src/components/wellness/CycleCalendarGrid';
import type { SharedCycle, SharedCycleDailyLog, SharedCycleSettings } from '@workspace/shared';

const baseSettings: SharedCycleSettings = {
  enabled: true,
  mode: 'standard',
  avg_cycle_length_override: 28,
  avg_period_length_override: 5,
  luteal_phase_length: 14,
  birth_control_method: 'none',
  conditions: [],
  show_fertile_window: true,
  preferred_products: [],
  dismissed_prompts: [],
  terminology: 'default',
  discreet_mode: false,
};

// Last cycle started 2026-08-01, so with a 28-day override the first predicted
// cycle starts 2026-08-29 (ovulation 2026-08-15, fertile 2026-08-10..16) —
// all inside the August grid seeded by initialDate.
const cycles: SharedCycle[] = [
  {
    start_date: '2026-08-01',
    end_date: null,
    period_length: 5,
    cycle_length: 28,
    is_excluded: false,
    source: 'derived',
  },
];

const logs: SharedCycleDailyLog[] = [
  {
    entry_date: '2026-08-02',
    flow_level: 'medium',
    product_usage: {},
    unusual_discharge: [],
  },
];

const renderGrid = (settings: SharedCycleSettings) =>
  render(
    <CycleCalendarGrid
      initialDate="2026-08-05"
      onDayPress={jest.fn()}
      cycles={cycles}
      logs={logs}
      settings={settings}
    />,
  );

describe('CycleCalendarGrid', () => {
  it('reports the visible month on mount and after navigation', () => {
    const onMonthChange = jest.fn();
    const { getByLabelText } = render(
      <CycleCalendarGrid
        initialDate="2026-08-05"
        onDayPress={jest.fn()}
        cycles={cycles}
        logs={logs}
        settings={baseSettings}
        onMonthChange={onMonthChange}
      />,
    );

    expect(onMonthChange).toHaveBeenCalledWith('2026-08');

    fireEvent.press(getByLabelText('Previous month'));
    expect(onMonthChange).toHaveBeenLastCalledWith('2026-07');

    fireEvent.press(getByLabelText('Next month'));
    expect(onMonthChange).toHaveBeenLastCalledWith('2026-08');
  });

  it('decorates predicted period, fertile window, and ovulation days in standard mode', () => {
    const { getByTestId } = renderGrid(baseSettings);

    expect(getByTestId('cycle-day-2026-08-29-predicted-period')).toBeTruthy();
    expect(getByTestId('cycle-day-2026-08-10-fertile')).toBeTruthy();
    expect(getByTestId('cycle-day-2026-08-15-ovulation')).toBeTruthy();
    expect(getByTestId('cycle-day-2026-08-02-period')).toBeTruthy();
  });

  it.each(['pregnant', 'postpartum', 'menopause'] as const)(
    'suppresses all predictions but keeps logged period days in %s mode',
    (mode) => {
      const { getByTestId, queryAllByTestId } = renderGrid({ ...baseSettings, mode });

      expect(queryAllByTestId(/-predicted-period$/)).toHaveLength(0);
      expect(queryAllByTestId(/-fertile$/)).toHaveLength(0);
      expect(queryAllByTestId(/-ovulation$/)).toHaveLength(0);
      expect(getByTestId('cycle-day-2026-08-02-period')).toBeTruthy();
    },
  );

  it('keeps predicted periods when only the fertile window is hidden', () => {
    const { getByTestId, queryAllByTestId } = renderGrid({
      ...baseSettings,
      show_fertile_window: false,
    });

    expect(getByTestId('cycle-day-2026-08-29-predicted-period')).toBeTruthy();
    expect(queryAllByTestId(/-fertile$/)).toHaveLength(0);
    expect(queryAllByTestId(/-ovulation$/)).toHaveLength(0);
  });

  it('suppresses fertility markers but keeps predicted periods on hormonal birth control', () => {
    const { getByTestId, queryAllByTestId } = renderGrid({
      ...baseSettings,
      birth_control_method: 'pill',
    });

    expect(getByTestId('cycle-day-2026-08-29-predicted-period')).toBeTruthy();
    expect(queryAllByTestId(/-fertile$/)).toHaveLength(0);
    expect(queryAllByTestId(/-ovulation$/)).toHaveLength(0);
  });
});
