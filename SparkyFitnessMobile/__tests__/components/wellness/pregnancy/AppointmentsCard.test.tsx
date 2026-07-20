import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AppointmentsCard from '../../../../src/components/wellness/pregnancy/AppointmentsCard';

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

  it('deletes an appointment', () => {
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

    const { getByTestId } = render(<AppointmentsCard />);
    fireEvent.press(getByTestId('delete-appointment-appt-1'));

    expect(mockDeleteAsync).toHaveBeenCalledWith('appt-1');
  });
});
