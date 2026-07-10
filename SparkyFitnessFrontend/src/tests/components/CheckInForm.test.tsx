import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CheckInForm } from '@/pages/CheckIn/CheckInForm';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValue?: string | Record<string, string>,
      options?: Record<string, string>
    ) => {
      const values =
        typeof defaultValue === 'object' ? defaultValue : (options ?? {});
      const translations: Record<string, string> = {
        'checkIn.dailyCheckIn': 'تسجيل القياسات',
        'checkIn.weight': 'الوزن',
        'checkIn.height': 'الطول',
        'checkIn.steps': 'الخطوات',
        'checkIn.neck': 'محيط الرقبة',
        'checkIn.waist': 'محيط الخصر',
        'checkIn.hips': 'محيط الورك',
        'checkIn.bodyFatPercentage': 'نسبة الدهون',
        'checkIn.useRecent': 'استخدام آخر القياسات',
        'checkIn.calculate': 'حساب النسبة',
        'checkIn.saveCheckIn': 'حفظ القياسات',
        'units.kilogram': 'كجم',
        'units.centimeter': 'سم',
        'units.stone': 'ستون',
        'units.pound': 'رطل',
        'unitInput.valueInUnit': '{{label}}: {{unit}}',
      };
      const fallback = typeof defaultValue === 'string' ? defaultValue : key;
      const template = translations[key] ?? fallback;
      return Object.entries(values).reduce(
        (value, [name, replacement]) =>
          value.replaceAll(`{{${name}}}`, replacement),
        template
      );
    },
  }),
}));

let mockWeightUnit = 'kg';

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    weightUnit: mockWeightUnit,
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
  beforeEach(() => {
    mockWeightUnit = 'kg';
  });

  it('renders the height input with the current height value', () => {
    render(<CheckInForm {...defaultProps} />);

    const heightInput = screen.getByLabelText('الطول');

    expect(heightInput).toBeInTheDocument();
    expect(heightInput).toHaveValue(180);
  });

  it('gives split weight fields distinct Arabic accessible names', () => {
    mockWeightUnit = 'st_lbs';
    render(<CheckInForm {...defaultProps} />);

    expect(screen.getByLabelText('الوزن: ستون')).toBeInTheDocument();
    expect(screen.getByLabelText('الوزن: رطل')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'حفظ القياسات' })
    ).toBeInTheDocument();
  });
});
