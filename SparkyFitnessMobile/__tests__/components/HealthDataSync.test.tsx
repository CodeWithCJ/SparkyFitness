import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import HealthDataSync from '../../src/components/HealthDataSync';

jest.mock('../../src/services/storage', () => ({
  loadCollapsedCategories: jest.fn().mockResolvedValue([]),
  saveCollapsedCategories: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/HealthMetrics', () => ({
  HEALTH_METRICS: [
    {
      id: 'steps',
      label: 'Steps fallback',
      stateKey: 'stepsEnabled',
      icon: 1,
      category: 'Common',
    },
    {
      id: 'futureMetric',
      label: 'Future Metric',
      stateKey: 'futureMetricEnabled',
      icon: 1,
      category: 'Future Category',
    },
  ],
  CATEGORY_ORDER: ['Common', 'Future Category'],
}));

function setTestLocale(locale: 'en' | 'pl'): void {
  (globalThis as typeof globalThis & {
    __setTestLocale: (value: 'en' | 'pl') => void;
  }).__setTestLocale(locale);
}

describe('HealthDataSync labels', () => {
  it.each([
    ['en', 'Steps', 'Future Metric', 'Common', 'Future Category'],
    ['pl', 'Kroki', 'Future Metric', 'Wspólne', 'Future Category'],
  ] as const)('translates known labels and preserves unknown values in %s', async (locale, knownMetric, unknownMetric, knownCategory, unknownCategory) => {
    setTestLocale(locale);

    const view = render(
      <HealthDataSync
        healthMetricStates={{ stepsEnabled: true, futureMetricEnabled: false }}
        handleToggleHealthMetric={jest.fn()}
        isAllMetricsEnabled={false}
        handleToggleAllMetrics={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(view.getByText(knownMetric)).toBeTruthy();
    });
    expect(view.getByText(unknownMetric)).toBeTruthy();
    expect(view.getByText(knownCategory)).toBeTruthy();
    expect(view.getByText(unknownCategory)).toBeTruthy();
  });
});
