import React from 'react';
import { render } from '@testing-library/react-native';
import MedicationChecklistCard from '../../../src/components/medications/MedicationChecklistCard';

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#3b82f6') : '#3b82f6',
}));

describe('MedicationChecklistCard', () => {
  it("shows today's progress with a bar and percentage", () => {
    const screen = render(
      <MedicationChecklistCard
        progress={{ completed: 2, total: 3, pct: 67 }}
        isToday
      />
    );
    expect(screen.getByText("Today's Checklist")).toBeTruthy();
    expect(screen.getByText('2 of 3 doses logged today.')).toBeTruthy();
    expect(screen.getByText('67%')).toBeTruthy();
    expect(screen.getByTestId('checklist-progress-fill').props.style).toEqual(
      expect.objectContaining({ width: '67%' })
    );
  });

  it('words another day without "today"', () => {
    const screen = render(
      <MedicationChecklistCard
        progress={{ completed: 1, total: 2, pct: 50 }}
        isToday={false}
      />
    );
    expect(screen.getByText('Medication Checklist')).toBeTruthy();
    expect(screen.getByText('1 of 2 doses logged for this day.')).toBeTruthy();
  });

  it('shows the empty message and no bar when nothing is due', () => {
    const screen = render(
      <MedicationChecklistCard
        progress={{ completed: 0, total: 0, pct: 100 }}
        isToday
      />
    );
    expect(screen.getByText('No scheduled doses for today.')).toBeTruthy();
    expect(screen.queryByTestId('checklist-progress-fill')).toBeNull();
    expect(screen.queryByText('100%')).toBeNull();
  });

  it('words an empty past day', () => {
    const screen = render(
      <MedicationChecklistCard
        progress={{ completed: 0, total: 0, pct: 100 }}
        isToday={false}
      />
    );
    expect(screen.getByText('No scheduled doses for this day.')).toBeTruthy();
  });
});
