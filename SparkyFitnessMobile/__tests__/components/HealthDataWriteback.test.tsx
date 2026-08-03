import React from 'react';
import { render } from '@testing-library/react-native';
import HealthDataWriteback from '../../src/components/HealthDataWriteback';

jest.mock('../../src/WritebackMetrics', () => ({
  WRITEBACK_METRICS: [
    {
      id: 'nutrition',
      label: 'Nutrition fallback',
      icon: 1,
      category: 'Nutrition',
    },
    {
      id: 'futureMetric',
      label: 'Future Writeback Metric',
      icon: 1,
      category: 'Future Writeback Category',
    },
  ],
  WRITEBACK_CATEGORY_ORDER: ['Nutrition', 'Future Writeback Category'],
}));

function setTestLocale(locale: 'en' | 'pl'): void {
  (globalThis as typeof globalThis & {
    __setTestLocale: (value: 'en' | 'pl') => void;
  }).__setTestLocale(locale);
}

describe('HealthDataWriteback labels', () => {
  it.each([
    ['en', 'Nutrition', 'Future Writeback Metric', 'Nutrition', 'Future Writeback Category'],
    ['pl', 'Odżywianie', 'Future Writeback Metric', 'Odżywianie', 'Future Writeback Category'],
  ] as const)('translates known labels and preserves unknown values in %s', (locale, knownMetric, unknownMetric, knownCategory, unknownCategory) => {
    setTestLocale(locale);

    const view = render(
      <HealthDataWriteback
        writebackStates={{ nutrition: true, futureMetric: false }}
        handleToggleWriteback={jest.fn()}
        onRemoveAllData={jest.fn()}
        onRemoveDateRange={jest.fn()}
      />,
    );

    expect(view.getAllByText(knownMetric).length).toBeGreaterThan(0);
    expect(view.getByText(unknownMetric)).toBeTruthy();
    expect(view.getAllByText(knownCategory).length).toBeGreaterThan(0);
    expect(view.getByText(unknownCategory)).toBeTruthy();
  });
});
