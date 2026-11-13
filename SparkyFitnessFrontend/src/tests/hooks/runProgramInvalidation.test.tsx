import { renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { runProgramKeys } from '@/api/keys/runPrograms';
import {
  useDiaryInvalidation,
  useExerciseInvalidation,
  useRunProgramInvalidation,
} from '@/hooks/useInvalidateKeys';

const setup = () => {
  const queryClient = new QueryClient();
  const spy = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const keys = () => spy.mock.calls.map((call) => call[0]?.queryKey);
  return { wrapper, keys };
};

describe('run program cache invalidation', () => {
  it('refreshes the program family when the diary changes', () => {
    const { wrapper, keys } = setup();
    renderHook(() => useDiaryInvalidation(), { wrapper }).result.current();
    expect(keys()).toContainEqual(runProgramKeys.all);
  });

  it('refreshes the program family when an exercise changes', () => {
    const { wrapper, keys } = setup();
    renderHook(() => useExerciseInvalidation(), { wrapper }).result.current();
    expect(keys()).toContainEqual(runProgramKeys.all);
  });

  it('refreshes programs, workout plans, exercise entries and daily progress together', () => {
    const { wrapper, keys } = setup();
    renderHook(() => useRunProgramInvalidation(), { wrapper }).result.current();
    expect(keys()).toEqual([
      runProgramKeys.all,
      ['workoutPlanTemplates'],
      ['exerciseEntries'],
      ['dailyProgress'],
    ]);
  });
});
