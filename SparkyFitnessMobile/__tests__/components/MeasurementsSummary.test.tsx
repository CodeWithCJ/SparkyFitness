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
    const { toJSON } = render(
      <MeasurementsSummary measurements={{ entry_date: '2024-06-15' }} />,
    );
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
        measurements={undefined}
        customMeasurements={[
          {
            id: 'entry-1',
            category_id: 'cat-1',
            value: '120',
            entry_date: '2024-06-15',
            source: 'manual',
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
            source: 'manual',
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
            source: 'manual',
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

  test('shows measurements section header', () => {
    const { getByText } = render(
      <MeasurementsSummary
        measurements={{ entry_date: '2024-06-15', weight: 75 }}
        customMeasurements={[]}
      />,
    );
    expect(getByText('Measurements')).toBeTruthy();
  });

  test('preserves empty numeric values and formats precise numeric values', () => {
    const { getByText } = render(
      <MeasurementsSummary
        measurements={undefined}
        customMeasurements={[
          {
            id: 'numeric',
            category_id: 'cat-1',
            value: '1.23456789',
            entry_date: '2024-06-15',
            source: 'manual',
            custom_categories: { name: 'Glucose', display_name: null, measurement_type: 'mg/dL', frequency: 'Daily', data_type: 'numeric' },
          },
          {
            id: 'boolean',
            category_id: 'cat-2',
            value: '   ',
            entry_date: '2024-06-15',
            source: 'manual',
            custom_categories: { name: 'Blank', display_name: null, measurement_type: 'm', frequency: 'Daily', data_type: 'numeric' },
          },
          {
            id: 'invalid',
            category_id: 'cat-3',
            value: 'not-a-number',
            entry_date: '2024-06-15',
            source: 'manual',
            custom_categories: { name: 'Note', display_name: null, measurement_type: '', frequency: 'Daily', data_type: 'numeric' },
          },
        ]}
      />,
    );
    expect(getByText('1.23456789 mg/dL')).toBeTruthy();
    expect(getByText('Blank')).toBeTruthy();
    expect(getByText('m')).toBeTruthy();
    expect(getByText('not-a-number')).toBeTruthy();
  });

  test('does not turn empty or whitespace numeric values into zero', () => {
    const { queryByText } = render(
      <MeasurementsSummary
        measurements={undefined}
        customMeasurements={[
          {
            id: 'empty',
            category_id: 'cat-empty',
            value: '',
            entry_date: '2024-06-15',
            source: 'manual',
            custom_categories: { name: 'Empty', display_name: null, measurement_type: 'm', frequency: 'Daily', data_type: 'numeric' },
          },
          {
            id: 'spaces',
            category_id: 'cat-spaces',
            value: '   ',
            entry_date: '2024-06-15',
            source: 'manual',
            custom_categories: { name: 'Spaces', display_name: null, measurement_type: 'm', frequency: 'Daily', data_type: 'numeric' },
          },
        ]}
      />,
    );
    expect(queryByText('0 m')).toBeNull();
  });

  test('Diary shows only manual custom entries', () => {
    const manualEntry = {
      id: 'entry-manual',
      category_id: 'cat-1',
      value: '120',
      entry_date: '2024-06-15',
      source: 'manual',
      custom_categories: {
        id: 'cat-1',
        name: 'Blood Pressure',
        measurement_type: 'mmHg',
        frequency: 'Daily',
      },
    };
    const syncedEntry = {
      id: 'entry-sync',
      category_id: 'cat-2',
      value: '75',
      entry_date: '2024-06-15',
      source: 'healthkit',
      custom_categories: {
        id: 'cat-2',
        name: 'Resting Heart Rate',
        measurement_type: 'bpm',
        frequency: 'Daily',
      },
    };
    const { getByText, queryByText } = render(
      <MeasurementsSummary
        measurements={undefined}
        customMeasurements={[manualEntry, syncedEntry]}
      />,
    );
    // Manual entry appears.
    expect(getByText('Blood Pressure')).toBeTruthy();
    expect(getByText('120 mmHg')).toBeTruthy();
    // Synced entry does NOT appear as a Diary tile.
    expect(queryByText('Resting Heart Rate')).toBeNull();
  });

  test('Diary shows nothing when only synced custom entries exist', () => {
    const { toJSON } = render(
      <MeasurementsSummary
        measurements={undefined}
        customMeasurements={[
          {
            id: 'entry-sync',
            category_id: 'cat-1',
            value: '75',
            entry_date: '2024-06-15',
            source: 'garmin',
            custom_categories: { name: 'Heart Rate', measurement_type: 'bpm', frequency: 'Daily' },
          },
        ]}
      />,
    );
    expect(toJSON()).toBeNull();
  });

  test('manual entry with value 0 still appears', () => {
    const { getByText } = render(
      <MeasurementsSummary
        measurements={undefined}
        customMeasurements={[
          {
            id: 'entry-zero',
            category_id: 'cat-1',
            value: '0',
            entry_date: '2024-06-15',
            source: 'manual',
            custom_categories: { name: 'Zero', measurement_type: '', frequency: 'Daily', data_type: 'numeric' },
          },
        ]}
      />,
    );
    // The rendered value text must show the literal 0 (not empty) so a real
    // zero cannot be silently dropped by formatting.
    expect(getByText('0')).toBeTruthy();
    expect(getByText('Zero')).toBeTruthy();
  });

  test('manual boolean false still appears', () => {
    const { getByText } = render(
      <MeasurementsSummary
        measurements={undefined}
        customMeasurements={[
          {
            id: 'entry-false',
            category_id: 'cat-1',
            value: 'false',
            entry_date: '2024-06-15',
            source: 'manual',
            custom_categories: { name: 'Flag', measurement_type: '', frequency: 'Daily', data_type: 'boolean' },
          },
        ]}
      />,
    );
    // Boolean false is a real value: the tile renders 'false' text.
    expect(getByText('false')).toBeTruthy();
    expect(getByText('Flag')).toBeTruthy();
  });

  test('mixture of manual and synced entries shows only manual tiles', () => {
    const { getByText, queryByText } = render(
      <MeasurementsSummary
        measurements={{ entry_date: '2024-06-15', weight: 75 }}
        customMeasurements={[
          {
            id: 'e1',
            category_id: 'c1',
            value: '50',
            entry_date: '2024-06-15',
            source: 'manual',
            custom_categories: { name: 'Manual A', measurement_type: '', frequency: 'Daily' },
          },
          {
            id: 'e2',
            category_id: 'c2',
            value: '60',
            entry_date: '2024-06-15',
            source: 'oura',
            custom_categories: { name: 'Oura Metric', measurement_type: '', frequency: 'Daily' },
          },
          {
            id: 'e3',
            category_id: 'c3',
            value: '70',
            entry_date: '2024-06-15',
            source: 'withings',
            custom_categories: { name: 'Withings Metric', measurement_type: '', frequency: 'Daily' },
          },
        ]}
      />,
    );
    expect(getByText('Weight')).toBeTruthy();
    expect(getByText('Manual A')).toBeTruthy();
    expect(queryByText('Oura Metric')).toBeNull();
    expect(queryByText('Withings Metric')).toBeNull();
  });

  test('Diary excludes custom entries with a null/missing source', () => {
    const { toJSON } = render(
      <MeasurementsSummary
        measurements={undefined}
        customMeasurements={[
          {
            id: 'entry-null',
            category_id: 'cat-1',
            value: '75',
            entry_date: '2024-06-15',
            source: null,
            custom_categories: { name: 'Null Source', measurement_type: '', frequency: 'Daily' },
          },
        ]}
      />,
    );
    // Strict contract: only literal 'manual' creates a tile.
    expect(toJSON()).toBeNull();
  });

});
