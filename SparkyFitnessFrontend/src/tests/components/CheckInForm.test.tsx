import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CheckInForm } from '@/pages/CheckIn/CheckInForm';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue,
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    weightUnit: 'kg',
    measurementUnit: 'cm',
  }),
}));

const defaultProps = {
  bodyFatPercentage: '',
  customCategories: [],
  customNotes: {},
  customValues: {},
  handleCalculateBodyFat: jest.fn(),
  handleSubmit: jest.fn(),
  height: '180',
  hips: '',
  loading: false,
  neck: '',
  setBodyFatPercentage: jest.fn(),
  setCustomNotes: jest.fn(),
  setCustomValues: jest.fn(),
  setHeight: jest.fn(),
  setHips: jest.fn(),
  setNeck: jest.fn(),
  setSteps: jest.fn(),
  setUseMostRecentForCalculation: jest.fn(),
  setWaist: jest.fn(),
  setWeight: jest.fn(),
  shouldConvertCustomMeasurement: jest.fn(),
  steps: '',
  useMostRecentForCalculation: false,
  waist: '',
  weight: '',
};

describe('CheckInForm', () => {
  it('renders the height input with the current height value', () => {
    render(<CheckInForm {...defaultProps} />);

    const heightInput = screen.getByLabelText('Height');

    expect(heightInput).toBeInTheDocument();
    expect(heightInput).toHaveValue(180);
  });
});
