import { fireEvent, render, screen } from '@testing-library/react';
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

const emptyPlaceholders = {
  weight: null,
  neck: null,
  waist: null,
  hips: null,
  height: null,
  bodyFatPercentage: null,
};

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
  placeholders: emptyPlaceholders,
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

  it('shows carried-forward values as placeholders, not input values', () => {
    render(
      <CheckInForm
        {...defaultProps}
        weight=""
        placeholders={{ ...emptyPlaceholders, weight: 82.5 }}
      />
    );

    const weightInput = screen.getByLabelText('Weight');

    expect(weightInput).toHaveValue(null);
    expect(weightInput).toHaveAttribute('placeholder', '82.5');
  });

  it('prefers the entered value over the placeholder', () => {
    render(
      <CheckInForm
        {...defaultProps}
        weight="80"
        placeholders={{ ...emptyPlaceholders, weight: 82.5 }}
      />
    );

    expect(screen.getByLabelText('Weight')).toHaveValue(80);
  });

  it('adopts the carried-forward value when "Use last" is clicked', () => {
    const setWeight = jest.fn();
    render(
      <CheckInForm
        {...defaultProps}
        weight=""
        placeholders={{ ...emptyPlaceholders, weight: 82.5 }}
        setWeight={setWeight}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use last' }));

    expect(setWeight).toHaveBeenCalledWith('82.5');
  });

  it('hides "Use last" when the field already has a value', () => {
    render(
      <CheckInForm
        {...defaultProps}
        weight="80"
        placeholders={{ ...emptyPlaceholders, weight: 82.5 }}
      />
    );

    expect(
      screen.queryByRole('button', { name: 'Use last' })
    ).not.toBeInTheDocument();
  });

  it('hides "Use last" when there is no carried-forward value', () => {
    render(<CheckInForm {...defaultProps} weight="" />);

    expect(
      screen.queryByRole('button', { name: 'Use last' })
    ).not.toBeInTheDocument();
  });
});
