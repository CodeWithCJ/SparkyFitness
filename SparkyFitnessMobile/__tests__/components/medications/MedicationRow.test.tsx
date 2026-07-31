import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import MedicationRow from '../../../src/components/medications/MedicationRow';
import type { Medication } from '@workspace/shared';

function buildMedication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 'med-1',
    user_id: 'user-1',
    name: 'Lisinopril',
    display_name: null,
    type_id: 'pill',
    route_id: null,
    strength_value: 10,
    strength_unit: 'mg',
    dose_amount: 1,
    dose_unit: 'tablet',
    reason_text: null,
    effectiveness_rating: null,
    color: null,
    icon: null,
    photo_path: null,
    is_active: true,
    is_quick: false,
    is_glp1: false,
    notes: null,
    source: 'manual',
    custom_fields: {},
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('MedicationRow', () => {
  it('shows the name with a dose and schedule summary', () => {
    const screen = render(
      <MedicationRow
        medication={buildMedication({
          schedules: [
            {
              id: 'sched-1',
              medication_id: 'med-1',
              schedule_type_id: 'daily',
              time_of_day: '08:00',
              dose_amount: null,
              days_of_week: null,
              interval_days: null,
              day_of_month: null,
              cycle_on_days: null,
              cycle_off_days: null,
              prn_reason: null,
              prn_max_per_day: null,
              with_meal: null,
              start_date: null,
              end_date: null,
              active: true,
              created_at: '2026-07-01T00:00:00Z',
              updated_at: '2026-07-01T00:00:00Z',
            },
          ],
        })}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText('Lisinopril')).toBeTruthy();
    expect(screen.getByText('1 tablet · Daily at 8:00 AM')).toBeTruthy();
  });

  it('summarizes schedule-less medications as as-needed', () => {
    const screen = render(<MedicationRow medication={buildMedication()} onPress={jest.fn()} />);

    expect(screen.getByText('1 tablet · As needed')).toBeTruthy();
  });

  it('fires onPress', () => {
    const onPress = jest.fn();
    const screen = render(<MedicationRow medication={buildMedication()} onPress={onPress} />);

    fireEvent.press(screen.getByText('Lisinopril'));
    expect(onPress).toHaveBeenCalled();
  });
});
