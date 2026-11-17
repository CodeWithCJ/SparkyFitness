import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useOngoingEpisodes, useSymptomEntries } from '@/hooks/useSymptoms';
import {
  listOngoingEpisodes,
  listSymptomEntries,
} from '@/api/Symptoms/symptomService';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('@/api/Symptoms/symptomService', () => ({
  listSymptomEntries: jest.fn(),
  listOngoingEpisodes: jest.fn(),
}));

let mockCycleOff = false;
jest.mock('@/hooks/Settings/useWebFeatures', () => ({
  useWebFeatures: () => ({
    isExplicitlyOff: (key: string) => key === 'cycle' && mockCycleOff,
  }),
}));

const entries = [
  { id: 'headache', source: 'manual' },
  { id: 'cramps', source: 'cycle' },
];

function setup<T>(hook: () => T) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(hook, { wrapper });
}

describe('symptoms logged in the cycle hub', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCycleOff = false;
    jest.mocked(listSymptomEntries).mockResolvedValue(entries as never);
    jest.mocked(listOngoingEpisodes).mockResolvedValue(entries as never);
  });

  it('are listed while cycle is on or was never set up', async () => {
    const { result } = setup(() => useSymptomEntries());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((e) => e.id)).toEqual([
      'headache',
      'cramps',
    ]);
  });

  it('are left out while cycle is turned off', async () => {
    mockCycleOff = true;
    const { result } = setup(() => ({
      entries: useSymptomEntries(),
      ongoing: useOngoingEpisodes(),
    }));
    await waitFor(() => expect(result.current.entries.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.ongoing.isSuccess).toBe(true));
    expect(result.current.entries.data?.map((e) => e.id)).toEqual(['headache']);
    expect(result.current.ongoing.data?.map((e) => e.id)).toEqual(['headache']);
  });
});
