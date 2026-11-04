import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMutationCache } from '@/lib/mutationCache';
import type { LabMarkerResponse, LabResultResponse } from '@workspace/shared';

export const result = (
  over: Partial<LabResultResponse> = {}
): LabResultResponse => ({
  id: 'r1',
  user_id: 'u1',
  marker_key: 'hba1c',
  custom_marker_id: null,
  entry_date: '2026-09-12',
  value_numeric: 5.1,
  value_text: null,
  unit: '%',
  ref_range_low: 4,
  ref_range_high: 5.6,
  lab_name: null,
  notes: null,
  source: 'manual',
  created_at: '2026-09-12T10:00:00.000Z',
  updated_at: '2026-09-12T10:00:00.000Z',
  ...over,
});

export const customMarker = (
  over: Partial<LabMarkerResponse> = {}
): LabMarkerResponse => ({
  id: '11111111-1111-4111-8111-111111111111',
  user_id: 'u1',
  name: 'Homocysteine',
  unit: 'umol/L',
  ref_range_low: null,
  ref_range_high: 15,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  ...over,
});

export const wrapper = () => {
  // The app's own mutation cache, so a test sees the toasts the app would raise.
  const client = new QueryClient({
    mutationCache: createMutationCache(),
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
};

/** The first of several matches; a test fails if there are none. */
export const first = <T,>(items: readonly T[]): T => {
  const [item] = items;
  if (item === undefined) throw new Error('Expected at least one match');
  return item;
};
