import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CorrelationCards from '../../../src/components/wellness/CorrelationCards';

jest.mock('../../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="icon" /> };
});

const mockUseCycleCorrelations = jest.fn();
jest.mock('../../../src/hooks/useCycleInsights', () => ({
  useCycleCorrelations: () => mockUseCycleCorrelations(),
}));

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CorrelationCards />
    </QueryClientProvider>,
  );
}

describe('CorrelationCards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state when no correlation data exists', () => {
    mockUseCycleCorrelations.mockReturnValue({
      correlations: { correlations: [], conditionFlags: [] },
      isLoading: false,
    });

    const { getByText } = renderComponent();
    expect(getByText('Correlations unlock with more data')).toBeTruthy();
  });

  it('renders correlations when data is present', () => {
    mockUseCycleCorrelations.mockReturnValue({
      correlations: {
        correlations: [
          {
            metric: 'energy',
            hasEnoughData: true,
            byPhase: [
              { phase: 'follicular', mean: 4.5, count: 5 },
              { phase: 'luteal', mean: 2.1, count: 5 },
            ],
            peakPhase: 'follicular',
            peakDelta: 2.4,
          },
        ],
        conditionFlags: [{ key: 'irregular_cycles' }],
      },
      isLoading: false,
    });

    const { getByText } = renderComponent();
    expect(getByText('Energy by cycle phase')).toBeTruthy();
    expect(getByText('Follicular')).toBeTruthy();
    expect(getByText('Luteal')).toBeTruthy();
  });
});
