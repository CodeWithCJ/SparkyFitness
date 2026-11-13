import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { getDueDosesForDate } from '@workspace/shared';
import MedicationDoseListCard from '../../../src/components/medications/MedicationDoseListCard';
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
jest.mock('../../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});
jest.mock('../../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { time_format: 'HH:mm' } }),
}));

const dose = {
  entryForDue: jest.fn(),
  logDose: jest.fn(),
  toggleTaken: jest.fn(),
  logPrn: jest.fn(),
} as unknown as ReturnType<typeof useLogDose>;
const onOpenMedication = jest.fn();

const lisinopril = buildMedication({ id: 'med-1', name: 'Lisinopril' });
const ibuprofen = buildMedication({
  id: 'med-2',
  name: 'Ibuprofen',
  schedules: [],
});

function renderCard(
  props: Partial<React.ComponentProps<typeof MedicationDoseListCard>> = {}
) {
  return render(
    <MedicationDoseListCard
      title="Today's medications"
      emptyDueText="Nothing due"
      emptyPrnText="No as-needed"
      dueDoses={getDueDosesForDate([lisinopril], '2026-10-14', 'UTC')}
      prnMedications={[ibuprofen]}
      dayEntries={[]}
      dose={dose}
      isToday
      onOpenMedication={onOpenMedication}
      {...props}
    />
  );
}

describe('MedicationDoseListCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (dose.entryForDue as jest.Mock).mockReturnValue(undefined);
  });

  it('lists due and as-needed medications', () => {
    const screen = renderCard();
    expect(screen.getByText("Today's medications")).toBeTruthy();
    expect(screen.getByText('Due today')).toBeTruthy();
    expect(screen.getByText('As needed')).toBeTruthy();
    expect(screen.getByText('Lisinopril')).toBeTruthy();
    expect(screen.getByText('Ibuprofen')).toBeTruthy();
  });

  it('uses a date-neutral due label on other days', () => {
    const screen = renderCard({ isToday: false });
    expect(screen.getByText('Due')).toBeTruthy();
    expect(screen.queryByText('Due today')).toBeNull();
  });

  it('logs and skips a due dose through the shared dose actions', () => {
    const screen = renderCard();
    fireEvent.press(screen.getByLabelText('Log Lisinopril as taken'));
    expect(dose.logDose).toHaveBeenCalledWith(
      expect.objectContaining({ medication: lisinopril }),
      'taken'
    );
    fireEvent.press(screen.getByLabelText('Skip Lisinopril'));
    expect(dose.logDose).toHaveBeenCalledWith(
      expect.objectContaining({ medication: lisinopril }),
      'skipped'
    );
  });

  it('shows a logged dose as taken', () => {
    (dose.entryForDue as jest.Mock).mockReturnValue(buildEntry());
    const screen = renderCard();
    expect(screen.getByText('Taken')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Unmark Lisinopril'));
    expect(dose.toggleTaken).toHaveBeenCalled();
  });

  it("logs an as-needed dose and counts the day's logs", () => {
    const screen = renderCard({
      dayEntries: [
        buildEntry({
          id: 'p1',
          medication_id: 'med-2',
          schedule_id: null,
          status: 'prn_taken',
        }),
        buildEntry({
          id: 'p2',
          medication_id: 'med-2',
          schedule_id: null,
          status: 'prn_taken',
        }),
        buildEntry({
          id: 'other',
          medication_id: 'med-1',
          status: 'prn_taken',
        }),
      ],
    });
    expect(screen.getByText('2')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Log Ibuprofen'));
    expect(dose.logPrn).toHaveBeenCalledWith(ibuprofen);
  });

  it('shows the empty messages', () => {
    const screen = renderCard({ dueDoses: [], prnMedications: [] });
    expect(screen.getByText('Nothing due')).toBeTruthy();
    expect(screen.getByText('No as-needed')).toBeTruthy();
  });

  it('opens a medication from its row', () => {
    const screen = renderCard();
    fireEvent.press(screen.getByText('Ibuprofen'));
    expect(onOpenMedication).toHaveBeenCalledWith('med-2');
  });

  it('shows a scheduled time when the slot has one', () => {
    const timed = buildMedication({
      id: 'med-3',
      name: 'Timed',
      schedules: [
        buildSchedule({
          id: 's3',
          medication_id: 'med-3',
          time_of_day: '21:30',
        }),
      ],
    });
    const screen = renderCard({
      dueDoses: getDueDosesForDate([timed], '2026-10-14', 'UTC'),
    });
    expect(screen.getByText('21:30')).toBeTruthy();
  });
});
