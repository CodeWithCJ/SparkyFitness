import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import AppointmentsCard from '../../../../src/components/wellness/pregnancy/AppointmentsCard';
import { getTodayDate, addDays } from '../../../../src/utils/dateUtils';

type AlertButton = { text: string; style?: string; onPress?: () => void };

jest.mock('../../../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="icon" /> };
});

const mockUseHealthAppointments = jest.fn();
const mockCreateAsync = jest.fn().mockResolvedValue({});
const mockDeleteAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../src/hooks/useHealthAppointments', () => ({
  useHealthAppointments: () => mockUseHealthAppointments(),
  useHealthAppointmentMutations: () => ({
    createAsync: mockCreateAsync,
    isCreating: false,
    deleteAsync: mockDeleteAsync,
    isDeleting: false,
  }),
}));

describe('AppointmentsCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders an empty state when there are no upcoming appointments', () => {
    mockUseHealthAppointments.mockReturnValue({ appointments: [], isLoading: false });
    const { getByText } = render(<AppointmentsCard />);
    expect(getByText('No upcoming appointments scheduled.')).toBeTruthy();
  });

  it('renders an existing appointment', () => {
    mockUseHealthAppointments.mockReturnValue({
      appointments: [
        {
          id: 'appt-1',
          user_id: 'u1',
          pregnancy_id: 'p1',
          scheduled_at: '2026-08-01T14:00:00.000Z',
          appointment_type: 'Ultrasound',
          title: 'Anatomy scan',
          location: 'City Hospital',
          notes: null,
          outcome: null,
        },
      ],
      isLoading: false,
    });

    const { getByText } = render(<AppointmentsCard />);
    expect(getByText('Anatomy scan')).toBeTruthy();
    expect(getByText('City Hospital')).toBeTruthy();
  });

  it('opens the add form and saves a new appointment', () => {
    mockUseHealthAppointments.mockReturnValue({ appointments: [], isLoading: false });
    const { getByText, getByPlaceholderText } = render(<AppointmentsCard />);

    fireEvent.press(getByText('Add'));
    fireEvent.changeText(getByPlaceholderText('Title (e.g. Anatomy scan)'), 'Checkup');
    fireEvent.press(getByText('Save Appointment'));

    expect(mockCreateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Checkup' }),
    );
  });

  it('does not save without a title', () => {
    mockUseHealthAppointments.mockReturnValue({ appointments: [], isLoading: false });
    const { getByText } = render(<AppointmentsCard />);

    fireEvent.press(getByText('Add'));
    fireEvent.press(getByText('Save Appointment'));

    expect(mockCreateAsync).not.toHaveBeenCalled();
  });

  it('does not save an appointment scheduled in the past', () => {
    mockUseHealthAppointments.mockReturnValue({ appointments: [], isLoading: false });
    const { getByText, getByPlaceholderText, UNSAFE_getByType } = render(<AppointmentsCard />);

    fireEvent.press(getByText('Add'));
    fireEvent.changeText(getByPlaceholderText('Title (e.g. Anatomy scan)'), 'Checkup');
    const CalendarSheet = require('../../../../src/components/CalendarSheet').default;
    const sheet = UNSAFE_getByType(CalendarSheet);
    act(() => sheet.props.onSelectDate(addDays(getTodayDate(), -1)));
    fireEvent.press(getByText('Save Appointment'));

    expect(mockCreateAsync).not.toHaveBeenCalled();
  });

  it('deletes an appointment through swipe-to-delete after confirming', () => {
    mockUseHealthAppointments.mockReturnValue({
      appointments: [
        {
          id: 'appt-1',
          user_id: 'u1',
          pregnancy_id: 'p1',
          scheduled_at: '2026-08-01T14:00:00.000Z',
          appointment_type: null,
          title: 'Checkup',
          location: null,
          notes: null,
          outcome: null,
        },
      ],
      isLoading: false,
    });
    let buttons: AlertButton[] = [];
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => {
      buttons = b as AlertButton[];
    });

    const { getByText } = render(<AppointmentsCard />);
    fireEvent.press(getByText('Delete'));
    buttons.find((b) => b.text === 'Delete')?.onPress?.();

    expect(mockDeleteAsync).toHaveBeenCalledWith('appt-1');
    alertSpy.mockRestore();
  });
});
