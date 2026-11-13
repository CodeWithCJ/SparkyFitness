import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUpdateExerciseEntryMutation } from '@/hooks/Exercises/useExerciseEntries';
import { updateExerciseEntry } from '@/api/Exercises/exerciseEntryService';
import { shoeKeys } from '@/api/keys/shoes';
import { exerciseEntryKeys } from '@/api/keys/exercises';

jest.mock('@/api/Exercises/exerciseEntryService', () => ({
  updateExerciseEntry: jest.fn(),
}));
jest.mock('@/i18n', () => ({
  t: (_key: string, fallback: string) => fallback,
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

it('invalidates shoe mileage and diary queries after an entry update without a shoe assignment', async () => {
  jest.mocked(updateExerciseEntry).mockResolvedValue(undefined);
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useUpdateExerciseEntryMutation(), {
    wrapper,
  });
  await act(async () => {
    await result.current.mutateAsync({
      id: 'entry-1',
      data: { distance: 10, imageFile: null },
    });
  });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: shoeKeys.all });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: exerciseEntryKeys.all });
  client.clear();
});
