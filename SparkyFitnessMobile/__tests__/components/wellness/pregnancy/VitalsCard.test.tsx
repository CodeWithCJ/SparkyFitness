import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import VitalsCard from '../../../../src/components/wellness/pregnancy/VitalsCard';

jest.mock('../../../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="icon" /> };
});

const mockUseMeasurements = jest.fn();
jest.mock('../../../../src/hooks/useMeasurements', () => ({
  useMeasurements: () => mockUseMeasurements(),
}));

const mockMutate = jest.fn();
jest.mock('../../../../src/hooks/useUpsertCheckIn', () => ({
  useUpsertCheckIn: () => ({ mutate: mockMutate, isPending: false }),
}));

jest.mock('../../../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_weight_unit: 'kg' } }),
}));

describe('VitalsCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders weight and medication link status', () => {
    mockUseMeasurements.mockReturnValue({ measurements: { weight: 65 }, isLoading: false });

    const { getByText } = render(
      <VitalsCard
        pregnancy={{
          due_date: '2026-06-01',
          due_date_basis: 'lmp',
          fetus_count: 1,
          status: 'active',
          prenatal_medication_id: 'med-1',
          supplement_medication_id: null,
        }}
      />,
    );

    expect(getByText('65 kg')).toBeTruthy();
    expect(getByText('Linked')).toBeTruthy();
    expect(getByText('Not set')).toBeTruthy();
  });

  it('shows placeholder when no weight is logged yet', () => {
    mockUseMeasurements.mockReturnValue({ measurements: null, isLoading: false });

    const { getByText } = render(
      <VitalsCard
        pregnancy={{
          due_date: '2026-06-01',
          due_date_basis: 'lmp',
          fetus_count: 1,
          status: 'active',
        }}
      />,
    );

    expect(getByText('—')).toBeTruthy();
  });

  it('saves an edited weight through the check-in mutation', () => {
    mockUseMeasurements.mockReturnValue({ measurements: { weight: 65 }, isLoading: false });

    const { getByText, getByPlaceholderText, getByTestId } = render(
      <VitalsCard
        pregnancy={{
          due_date: '2026-06-01',
          due_date_basis: 'lmp',
          fetus_count: 1,
          status: 'active',
        }}
      />,
    );

    fireEvent.press(getByText('65 kg'));
    fireEvent.changeText(getByPlaceholderText('kg'), '66.5');
    fireEvent.press(getByTestId('vitals-weight-save'));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ weight: 66.5 }),
    );
  });
});
