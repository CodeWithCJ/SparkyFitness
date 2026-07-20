import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CycleInsightsView from '../../../src/components/wellness/CycleInsightsView';

jest.mock('../../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="icon" /> };
});

jest.mock('../../../src/components/wellness/BBTLineChart', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="bbt-chart" /> };
});

jest.mock('../../../src/components/wellness/CorrelationCards', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="correlation-cards" /> };
});

jest.mock('../../../src/hooks/useCycleInsights', () => ({
  useCycleInsights: () => ({
    insights: {
      stats: {},
      // Server returns forecast as Record<dateString, symptomName[]>.
      forecast: {
        '2099-01-01': ['Cramps'],
      },
      anomalies: [
        { message: 'Potential irregular cycle pattern detected.' },
      ],
      bbtSeries: [],
    },
    isLoading: false,
  }),
  useCycleCorrelations: () => ({
    correlations: null,
    isLoading: false,
  }),
}));

jest.mock('../../../src/hooks/useCycleHistory', () => ({
  useCycleHistory: () => ({
    cycles: [],
    isLoading: false,
  }),
}));

jest.mock('../../../src/hooks/useCycleSettings', () => ({
  useCycleSettings: () => ({
    settings: {
      avg_cycle_length_override: 28,
      avg_period_length_override: 5,
    },
    isLoading: false,
  }),
}));

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CycleInsightsView />
    </QueryClientProvider>,
  );
}

describe('CycleInsightsView', () => {
  it('renders summary, predictions, clinical alerts, and forecast', () => {
    const { getByText, getByTestId } = renderComponent();

    expect(getByText('Cycle Summary')).toBeTruthy();
    expect(getByText('Clinical Health Alerts')).toBeTruthy();
    expect(getByText('Potential irregular cycle pattern detected.')).toBeTruthy();
    expect(getByText('Symptom Forecast')).toBeTruthy();
    expect(getByText('Cramps')).toBeTruthy();
    expect(getByTestId('bbt-chart')).toBeTruthy();
    expect(getByTestId('correlation-cards')).toBeTruthy();
  });
});
