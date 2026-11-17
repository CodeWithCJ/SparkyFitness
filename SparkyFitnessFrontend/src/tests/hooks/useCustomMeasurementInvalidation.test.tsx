import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import {
  useSaveCustomMeasurementMutation,
  useDeleteCustomMeasurementMutation,
} from '@/hooks/CheckIn/useCheckIn';
import {
  saveCustomMeasurement,
  deleteCustomMeasurement,
} from '@/api/CheckIn/checkInService';

jest.mock('@/api/CheckIn/checkInService', () => ({
  saveCustomMeasurement: jest.fn(),
  deleteCustomMeasurement: jest.fn(),
}));

test('custom save and delete invalidate mounted glucose context as well as check-in queries', async () => {
  const client = new QueryClient();
  const key = ['glucoseContext', 'owner', '2026-11-03', 'UTC'];
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  jest.mocked(saveCustomMeasurement).mockResolvedValue(undefined);
  jest.mocked(deleteCustomMeasurement).mockResolvedValue(undefined);
  const { result } = renderHook(
    () => ({
      save: useSaveCustomMeasurementMutation(),
      remove: useDeleteCustomMeasurementMutation(),
    }),
    { wrapper }
  );
  client.setQueryData(key, { events: [] });
  await act(async () => {
    await result.current.save.mutateAsync({
      category_id: 'stress',
      value: '35',
      entry_date: '2026-11-03',
    });
  });
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  client.setQueryData(key, { events: [] });
  await act(async () => {
    await result.current.remove.mutateAsync('entry');
  });
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  client.clear();
});
