import React from 'react';
import { render } from '@testing-library/react-native';
import MeasurementsSummary from '../../src/components/MeasurementsSummary';

jest.mock('../../src/components/Icon', () => 'Icon');

jest.mock('../../src/components/icons/measurements', () => ({
  MeasurementIcons: {},
}));

jest.mock('uniwind', () => ({
  useCSSVariable: jest.fn(() => ['#000', '#666']),
}));

describe('MeasurementsSummary', () => {
  test('renders null when no measurements or custom measurements', () => {
    const { toJSON } = render(<MeasurementsSummary measurements={undefined} />);
    expect(toJSON()).toBeNull();
  });

  test('renders null when measurements object has no values and no custom measurements', () => {
    const { toJSON } = render(<MeasurementsSummary measurements={{}} />);
    expect(toJSON()).toBeNull();
  });

  test('renders built-in measurement rows', () => {
    const { getByText } = render(
      <MeasurementsSummary
        measurements={{
          entry_date: '2024-06-15',
          weight: 75,
          steps: 10000,
        }}
      />,
    );
    expect(getByText('Weight')).toBeTruthy();
    expect(getByText('Steps')).toBeTruthy();
  });

  test('renders custom measurement rows', () => {
    const { getByText } = render(
      <MeasurementsSummary
        measurements={{}}
        customMeasurements={[
          {
            id: 'entry-1',
            category_id: 'cat-1',
            value: '120',
            entry_date: '2024-06-15',
            custom_categories: {
              id: 'cat-1',
              name: 'Blood Pressure',
              measurement_type: 'mmHg',
              frequency: 'Daily',
            },
          },
          {
            id: 'entry-2',
            category_id: 'cat-2',
            value: '95',
            entry_date: '2024-06-15',
            custom_categories: {
              id: 'cat-2',
              name: 'Blood Sugar',
              display_name: 'Glucose',
              measurement_type: 'mg/dL',
              frequency: 'Daily',
            },
          },
        ]}
      />,
    );
    expect(getByText('Blood Pressure')).toBeTruthy();
    expect(getByText('120 mmHg')).toBeTruthy();
    expect(getByText('Glucose')).toBeTruthy();
    expect(getByText('95 mg/dL')).toBeTruthy();
  });

  test('renders both built-in and custom measurements', () => {
    const { getByText } = render(
      <MeasurementsSummary
        measurements={{
          entry_date: '2024-06-15',
          weight: 75,
        }}
        customMeasurements={[
          {
            id: 'entry-1',
            category_id: 'cat-1',
            value: '120',
            entry_date: '2024-06-15',
            custom_categories: {
              id: 'cat-1',
              name: 'Blood Pressure',
              measurement_type: 'mmHg',
              frequency: 'Daily',
            },
          },
        ]}
      />,
    );
    expect(getByText('Weight')).toBeTruthy();
    expect(getByText('Blood Pressure')).toBeTruthy();
    expect(getByText('120 mmHg')).toBeTruthy();
  });

  test('hides custom measurement rows whose category is not visible', () => {
    const { getByText, queryByText } = render(
      <MeasurementsSummary
        measurements={{}}
        customMeasurements={[
          {
            id: 'entry-1',
            category_id: 'cat-1',
            value: '120',
            entry_date: '2024-06-15',
            custom_categories: {
              id: 'cat-1',
              name: 'Blood Pressure',
              measurement_type: 'mmHg',
              frequency: 'Daily',
              is_visible: true,
            },
          },
          {
            id: 'entry-2',
            category_id: 'cat-2',
            value: '95',
            entry_date: '2024-06-15',
            custom_categories: {
              id: 'cat-2',
              name: 'Hidden Category',
              measurement_type: 'mg/dL',
              frequency: 'Daily',
              is_visible: false,
            },
          },
        ]}
      />,
    );
    expect(getByText('Blood Pressure')).toBeTruthy();
    expect(getByText('120 mmHg')).toBeTruthy();
    expect(queryByText('Hidden Category')).toBeNull();
    expect(queryByText('95 mg/dL')).toBeNull();
  });

  test('shows measurements section header', () => {
    const { getByText } = render(
      <MeasurementsSummary
        measurements={{ entry_date: '2024-06-15', weight: 75 }}
        customMeasurements={[]}
      />,
    );
    expect(getByText('Measurements')).toBeTruthy();
  });
});
