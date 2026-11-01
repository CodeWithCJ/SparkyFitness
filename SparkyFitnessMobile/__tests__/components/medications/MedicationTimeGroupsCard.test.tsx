import React, { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { getDueDosesForDate } from '@workspace/shared';
import MedicationTimeGroupsCard from '../../../src/components/medications/MedicationTimeGroupsCard';
import type { useLogDose } from '../../../src/hooks/useMedications';
import {
  buildEntry,
  buildMedication,
  buildSchedule,
} from '../../helpers/medicationFixtures';

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));
jest.mock('../../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { time_format: 'HH:mm' } }),
}));

const dose = {
  entryForDue: jest.fn(),
  logDose: jest.fn(),
  toggleTaken: jest.fn(),
  logDosesBatch: jest.fn().mockResolvedValue(0),
  logPrn: jest.fn(),
} as unknown as ReturnType<typeof useLogDose>;

const lisinopril = buildMedication({
  id: 'med-1',
  name: 'Lisinopril',
  schedules: [
    buildSchedule({ id: 's1', medication_id: 'med-1', time_of_day: '08:00' }),
  ],
});
const metformin = buildMedication({
  id: 'med-2',
  name: 'Metformin',
  schedules: [
    buildSchedule({ id: 's2', medication_id: 'med-2', time_of_day: '08:00' }),
  ],
});
const atorvastatin = buildMedication({
  id: 'med-3',
  name: 'Atorvastatin',
  schedules: [
    buildSchedule({ id: 's3', medication_id: 'med-3', time_of_day: '21:00' }),
  ],
});
const ibuprofen = buildMedication({
  id: 'med-4',
  name: 'Ibuprofen',
  schedules: [
    buildSchedule({ id: 's4', medication_id: 'med-4', time_of_day: '12:00' }),
  ],
});

const dueDoses = getDueDosesForDate(
  [lisinopril, metformin, atorvastatin, ibuprofen],
  '2026-10-14',
  'UTC'
);

describe('MedicationTimeGroupsCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (dose.entryForDue as jest.Mock).mockReturnValue(undefined);
  });

  it('shows a row for each time with two or more pending doses', () => {
    const screen = render(
      <MedicationTimeGroupsCard dueDoses={dueDoses} dose={dose} />
    );

    expect(screen.getByText('Take at once')).toBeTruthy();
    expect(screen.getByText('08:00')).toBeTruthy();
    expect(screen.getByText('2 doses pending')).toBeTruthy();
    // 21:00 and 12:00 each carry a single pending dose: no batch row.
    expect(screen.queryByText('21:00')).toBeNull();
    expect(screen.queryByText('12:00')).toBeNull();
  });

  it('renders nothing when no time has two pending doses', () => {
    const single = getDueDosesForDate(
      [lisinopril, atorvastatin],
      '2026-10-14',
      'UTC'
    );
    const screen = render(
      <MedicationTimeGroupsCard dueDoses={single} dose={dose} />
    );

    expect(screen.queryByText('Take at once')).toBeNull();
  });

  it('marks every pending dose at the time as taken in one action', async () => {
    const screen = render(
      <MedicationTimeGroupsCard dueDoses={dueDoses} dose={dose} />
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('time-group-mark-all-08:00'));
    });

    expect(dose.logDosesBatch).toHaveBeenCalledWith(
      [
        expect.objectContaining({ medication: lisinopril }),
        expect.objectContaining({ medication: metformin }),
      ],
      'taken'
    );
  });

  it('excludes already-taken doses from the batch', () => {
    (dose.entryForDue as jest.Mock).mockImplementation((due) =>
      due.medication.id === 'med-1'
        ? buildEntry({ medication_id: 'med-1', status: 'taken' })
        : undefined
    );
    const screen = render(
      <MedicationTimeGroupsCard dueDoses={dueDoses} dose={dose} />
    );

    // Only Metformin is pending at 08:00, below the two-dose threshold.
    expect(screen.queryByText('Take at once')).toBeNull();
  });

  it('shows a row again once a taken dose is undone', () => {
    (dose.entryForDue as jest.Mock).mockImplementation((due) =>
      due.medication.id === 'med-1'
        ? buildEntry({ medication_id: 'med-1', status: 'snoozed' })
        : undefined
    );
    const screen = render(
      <MedicationTimeGroupsCard dueDoses={dueDoses} dose={dose} />
    );

    expect(screen.getByText('08:00')).toBeTruthy();
  });
});
