import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CheckInForm } from '@/pages/CheckIn/CheckInForm';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Mirrors the two call shapes used here: a plain default string, and an
    // options object carrying `defaultValue` plus interpolation values.
    t: (_key: string, arg?: unknown) =>
      typeof arg === 'string'
        ? arg
        : ((arg as { defaultValue?: string } | undefined)?.defaultValue ??
          _key),
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
  bmr: null,
};

const defaultProps = {
  bodyFatPercentage: '',
  muscleMassKg: '',
  boneMassKg: '',
  bodyWaterPercentage: '',
  bmr: '',
  customCategories: [],
  customNotes: {},
  customPlaceholders: {},
  customValues: {},
  handleCalculateBodyFat: jest.fn(),
  handleSubmit: jest.fn(),
  height: '180',
  hips: '',
  loading: false,
  neck: '',
  placeholders: emptyPlaceholders,
  setBodyFatPercentage: jest.fn(),
  setMuscleMassKg: jest.fn(),
  setBoneMassKg: jest.fn(),
  setBodyWaterPercentage: jest.fn(),
  setBmr: jest.fn(),
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

  describe('custom category previous values', () => {
    const numericCategory = {
      id: 'cat-1',
      name: 'Chest',
      display_name: 'Chest',
      measurement_type: 'cm',
      frequency: 'Daily',
      data_type: 'numeric',
    };
    const textCategory = {
      id: 'cat-2',
      name: 'Notes Field',
      display_name: 'Notes Field',
      measurement_type: '',
      frequency: 'Daily',
      data_type: 'text',
    };

    it('shows a previous custom value as a placeholder, not an input value', () => {
      render(
        <CheckInForm
          {...defaultProps}
          customCategories={[numericCategory]}
          customValues={{}}
          customPlaceholders={{ 'cat-1': '97.5' }}
        />
      );

      const field = screen.getByLabelText('Chest (cm)');
      expect(field).toHaveAttribute('placeholder', '97.5');
      expect(field).toHaveValue(null);
    });

    it('adopts a custom previous value through "Use last"', () => {
      const setCustomValues = jest.fn();
      render(
        <CheckInForm
          {...defaultProps}
          customCategories={[numericCategory]}
          customValues={{}}
          customPlaceholders={{ 'cat-1': '97.5' }}
          setCustomValues={setCustomValues}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Use last' }));

      expect(setCustomValues).toHaveBeenCalled();
    });

    it('does not offer a custom previous value when the day already has one', () => {
      render(
        <CheckInForm
          {...defaultProps}
          customCategories={[numericCategory]}
          customValues={{ 'cat-1': '99' }}
          customPlaceholders={{ 'cat-1': '97.5' }}
        />
      );

      expect(screen.getByLabelText('Chest (cm)')).toHaveValue(99);
      expect(
        screen.queryByRole('button', { name: 'Use last' })
      ).not.toBeInTheDocument();
    });

    it('uses a text custom value verbatim as the placeholder', () => {
      const { container } = render(
        <CheckInForm
          {...defaultProps}
          customCategories={[textCategory]}
          customValues={{}}
          customPlaceholders={{ 'cat-2': 'felt strong' }}
        />
      );

      const field = container.querySelector('#custom-cat-2');
      expect(field).toHaveAttribute('placeholder', 'felt strong');
    });

    it('renders no custom placeholder when none was loaded', () => {
      const { container } = render(
        <CheckInForm
          {...defaultProps}
          customCategories={[numericCategory]}
          customValues={{}}
          customPlaceholders={{}}
        />
      );

      // With nothing loaded the field falls back to its generic prompt, so no
      // number appears where a previous value would be.
      expect(container.querySelector('#custom-cat-1')).toHaveAttribute(
        'placeholder',
        'Enter chest'
      );
    });
  });
});
