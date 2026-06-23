import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RecentActivity } from '@/pages/CheckIn/RecentActivity';
import { CombinedMeasurement } from '@/types/checkin';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue,
  }),
}));

const mockPreferences = {
  weightUnit: 'kg',
  measurementUnit: 'cm',
  measurementDecimalPlaces: 0,
};

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => mockPreferences,
}));

const baseMeasurement: CombinedMeasurement = {
  id: '1',
  entry_date: '2026-06-22',
  entry_hour: 14,
  entry_timestamp: '2026-06-22T14:00:00Z',
  value: '72',
  type: 'custom',
  display_name: 'Body Battery Charged',
};

const defaultProps = {
  convertMeasurement: jest.fn((v: number) => v),
  convertWeight: jest.fn((v: number) => v),
  handleDeleteMeasurementClick: jest.fn(),
  recentMeasurements: [] as CombinedMeasurement[],
  shouldConvertCustomMeasurement: jest.fn(() => false),
};

describe('RecentActivity', () => {
  it('hides N/A unit for custom measurements', () => {
    const measurements: CombinedMeasurement[] = [
      {
        ...baseMeasurement,
        value: '72',
        custom_categories: {
          id: 'cat1',
          name: 'Body Battery Charged',
          measurement_type: 'N/A',
          frequency: 'daily',
          data_type: null,
          display_name: 'Body Battery Charged',
        },
      },
    ];

    render(
      <RecentActivity {...defaultProps} recentMeasurements={measurements} />
    );

    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.queryByText(/N\/A/)).not.toBeInTheDocument();
  });

  it('rounds decimal values for custom measurements with N/A unit', () => {
    const measurements: CombinedMeasurement[] = [
      {
        ...baseMeasurement,
        display_name: 'BMI',
        value: '23.700000762939453',
        custom_categories: {
          id: 'cat2',
          name: 'BMI',
          measurement_type: 'N/A',
          frequency: 'daily',
          data_type: null,
          display_name: 'BMI',
        },
      },
    ];

    render(
      <RecentActivity {...defaultProps} recentMeasurements={measurements} />
    );

    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.queryByText(/23\.7/)).not.toBeInTheDocument();
  });

  it('rounds decimal values for standard measurements with non-standard units', () => {
    const measurements: CombinedMeasurement[] = [
      {
        ...baseMeasurement,
        type: 'standard',
        display_name: 'Fitness Age',
        value: '29.322887991352367',
        display_unit: 'years',
      },
    ];

    render(
      <RecentActivity {...defaultProps} recentMeasurements={measurements} />
    );

    expect(screen.getByText('29 years')).toBeInTheDocument();
    expect(screen.queryByText(/29\.3/)).not.toBeInTheDocument();
  });

  it('hides N/A unit for standard measurements', () => {
    const measurements: CombinedMeasurement[] = [
      {
        ...baseMeasurement,
        type: 'standard',
        display_name: 'Body Battery Current',
        value: '93',
        display_unit: 'N/A',
      },
    ];

    render(
      <RecentActivity {...defaultProps} recentMeasurements={measurements} />
    );

    expect(screen.getByText('93')).toBeInTheDocument();
    expect(screen.queryByText(/N\/A/)).not.toBeInTheDocument();
  });

  it('preserves valid units for custom measurements', () => {
    const measurements: CombinedMeasurement[] = [
      {
        ...baseMeasurement,
        display_name: 'Steps',
        value: '813',
        custom_categories: {
          id: 'cat3',
          name: 'Steps',
          measurement_type: 'steps',
          frequency: 'daily',
          data_type: null,
          display_name: 'Steps',
        },
      },
    ];

    render(
      <RecentActivity {...defaultProps} recentMeasurements={measurements} />
    );

    expect(screen.getByText('813 steps')).toBeInTheDocument();
  });

  it('preserves valid units for standard measurements', () => {
    const measurements: CombinedMeasurement[] = [
      {
        ...baseMeasurement,
        type: 'standard',
        display_name: 'Lactate Threshold HR',
        value: '172',
        display_unit: 'bpm',
      },
    ];

    render(
      <RecentActivity {...defaultProps} recentMeasurements={measurements} />
    );

    expect(screen.getByText('172 bpm')).toBeInTheDocument();
  });

  it('falls back to raw value when value is not a valid number', () => {
    const measurements: CombinedMeasurement[] = [
      {
        ...baseMeasurement,
        display_name: 'Some Metric',
        value: 'abc',
        custom_categories: {
          id: 'cat4',
          name: 'Some Metric',
          measurement_type: 'N/A',
          frequency: 'daily',
          data_type: null,
          display_name: 'Some Metric',
        },
      },
    ];

    render(
      <RecentActivity {...defaultProps} recentMeasurements={measurements} />
    );

    expect(screen.getByText('abc')).toBeInTheDocument();
  });

  it('respects measurementDecimalPlaces preference', () => {
    mockPreferences.measurementDecimalPlaces = 1;

    const measurements: CombinedMeasurement[] = [
      {
        ...baseMeasurement,
        display_name: 'BMI',
        value: '23.700000762939453',
        custom_categories: {
          id: 'cat5',
          name: 'BMI',
          measurement_type: 'N/A',
          frequency: 'daily',
          data_type: null,
          display_name: 'BMI',
        },
      },
    ];

    render(
      <RecentActivity {...defaultProps} recentMeasurements={measurements} />
    );

    expect(screen.getByText('23.7')).toBeInTheDocument();

    mockPreferences.measurementDecimalPlaces = 0;
  });
});
