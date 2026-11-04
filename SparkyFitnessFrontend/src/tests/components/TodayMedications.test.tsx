import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TodayMedications from '@/pages/Medications/TodayMedications';
import type { MedicationDetail } from '@/types/medications';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string | Record<string, unknown>) =>
      typeof defaultValue === 'string' ? defaultValue : _key,
  }),
  initReactI18next: { type: '3rdParty', init: jest.fn() },
}));

let mockTimezone = 'Europe/Berlin';
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    timezone: mockTimezone,
    timeFormat: 'HH:mm',
    formatTime: () => '',
  }),
}));

// ActiveUserContext reaches useAuth and so better-auth's untransformed ESM
// build; mock the hook instead.
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({
    hasPermission: () => false,
    activeUserName: 'Test User',
  }),
}));

const mockCreateEntry = jest.fn();
const idleMutation = () => ({ mutate: jest.fn(), isPending: false });
jest.mock('@/hooks/useMedications', () => ({
  useCreateMedicationEntryMutation: () => ({
    mutate: mockCreateEntry,
    isPending: false,
  }),
  useUpdateMedicationEntryMutation: () => idleMutation(),
  useDeleteMedicationEntryMutation: () => idleMutation(),
  useLogGlpInjectionEntryMutation: () => idleMutation(),
  useUpdateInjectionEntryMutation: () => idleMutation(),
  useDeleteInjectionEntryMutation: () => idleMutation(),
}));

// Children with their own data hooks, not under test here.
jest.mock('@/pages/Medications/GlpDailyCheckIn', () => () => null);
jest.mock('@/pages/Medications/Glp1QuickLogDialog', () => () => null);
jest.mock('@/pages/Medications/MedicationLogCalendar', () => () => null);

const medWithDose = (timeOfDay: string): MedicationDetail => ({
  id: 'med-1',
  user_id: 'user-1',
  name: 'Vitamin D',
  display_name: null,
  type_id: 'pill',
  route_id: null,
  strength_value: null,
  strength_unit: null,
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
  is_supplement: false,
  nutrients: {},
  notes: null,
  source: 'manual',
  custom_fields: {},
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  schedules: [
    {
      id: 'sched-1',
      medication_id: 'med-1',
      schedule_type_id: 'daily',
      time_of_day: timeOfDay,
      dose_amount: null,
      days_of_week: null,
      interval_days: null,
      day_of_month: null,
      cycle_on_days: null,
      cycle_off_days: null,
      prn_reason: null,
      prn_max_per_day: null,
      with_meal: null,
      start_date: '2026-01-01',
      end_date: null,
      active: true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ],
});

describe('TodayMedications scheduled doses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTimezone = 'Europe/Berlin';
  });

  // Regression for #3319: on clock-change days scheduled_for was built by
  // adding elapsed hours to local midnight, an hour off the dose's time.
  // In the repeated hour the second occurrence is used, and the missing hour
  // moves forward an hour, as for drink times.
  it.each([
    ['Europe/Berlin', '2026-10-25', '09:30', '2026-10-25T08:30:00.000Z'], // clocks go back
    ['Europe/Berlin', '2026-10-25', '02:30', '2026-10-25T01:30:00.000Z'], // repeated hour
    ['Europe/Berlin', '2026-03-29', '08:00', '2026-03-29T06:00:00.000Z'], // clocks go forward
    ['Europe/Berlin', '2026-03-29', '02:30', '2026-03-29T01:30:00.000Z'], // missing hour
    ['Europe/Berlin', '2026-10-26', '08:00', '2026-10-26T07:00:00.000Z'], // normal day
    ['America/New_York', '2026-11-01', '09:30', '2026-11-01T14:30:00.000Z'], // clocks go back
    ['America/New_York', '2026-03-08', '09:30', '2026-03-08T13:30:00.000Z'], // clocks go forward
    ['America/New_York', '2026-03-08', '02:30', '2026-03-08T07:30:00.000Z'], // missing hour
  ])(
    'in %s on %s logs a %s dose as scheduled for %s',
    (tz, day, timeOfDay, expected) => {
      mockTimezone = tz;
      render(
        <TodayMedications
          selectedDate={day}
          today="2026-12-31"
          meds={[medWithDose(timeOfDay)]}
          entries={[]}
          recentEntries={[]}
          loadingMeds={false}
          loadingEntries={false}
          onSelectDate={jest.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Take' }));

      expect(mockCreateEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          schedule_id: 'sched-1',
          status: 'taken',
          scheduled_for: expected,
        }),
        expect.anything()
      );
    }
  );
});
