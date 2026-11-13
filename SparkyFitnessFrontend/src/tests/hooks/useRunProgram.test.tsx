import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RunProgramResponse } from '@workspace/shared';
import { runProgramKeys } from '@/api/keys/runPrograms';
import { exerciseEntryKeys } from '@/api/keys/exercises';
import { dailyProgressKeys } from '@/api/keys/diary';
import {
  useCompleteRunProgramWorkoutMutation,
  useCustomRunPrograms,
  useRunProgram,
  useSaveRunProgramMutation,
} from '@/hooks/Exercises/useRunProgram';
import {
  completeRunProgramWorkout,
  getCustomRunPrograms,
  getRunProgram,
  saveRunProgram,
} from '@/api/Exercises/runPrograms';
import { toggleDayBody } from '@workspace/shared';
import {
  makeCustomProgram,
  makeRunProgram,
} from '@/tests/mocks/runProgramFixture';

jest.mock('@/api/Exercises/runPrograms', () => ({
  getRunProgram: jest.fn(),
  saveRunProgram: jest.fn(),
  completeRunProgramWorkout: jest.fn(),
  getCustomRunPrograms: jest.fn(),
}));

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

const mockGet = getRunProgram as jest.MockedFunction<typeof getRunProgram>;
const mockSave = saveRunProgram as jest.MockedFunction<typeof saveRunProgram>;
const mockComplete = completeRunProgramWorkout as jest.MockedFunction<
  typeof completeRunProgramWorkout
>;
const mockCustom = getCustomRunPrograms as jest.MockedFunction<
  typeof getCustomRunPrograms
>;

const setup = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, invalidate, Wrapper };
};

describe('useRunProgram', () => {
  beforeEach(() => jest.resetAllMocks());

  it('reads the program, its place and its schedule', async () => {
    mockGet.mockResolvedValue({
      program: makeRunProgram({
        next_index: 4,
        run_days: [1, 3],
        start_date: '2026-10-12',
        end_date: '2026-12-01',
        last_done_date: '2026-10-13',
      }),
    });
    const { Wrapper } = setup();
    const { result } = renderHook(() => useRunProgram(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.status).toMatchObject({ done: 4, total: 27 });
    expect(result.current.enabled).toBe(true);
    expect(result.current.schedule).toEqual({
      days: [1, 3],
      startDay: '2026-10-12',
      endDay: '2026-12-01',
    });
    expect(result.current.doneDay).toBe('2026-10-13');
  });

  it('has no status when no program is chosen', async () => {
    mockGet.mockResolvedValue({ program: null });
    const { Wrapper } = setup();
    const { result } = renderHook(() => useRunProgram(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.program).toBeNull();
    expect(result.current.status).toBeNull();
    expect(result.current.enabled).toBe(false);
  });

  it('does not ask the server while it is turned off (acting for someone)', () => {
    const { Wrapper } = setup();
    const { result } = renderHook(() => useRunProgram(false), {
      wrapper: Wrapper,
    });
    expect(result.current.isLoading).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('useCustomRunPrograms', () => {
  beforeEach(() => jest.resetAllMocks());

  it("lists the person's own plans", async () => {
    mockCustom.mockResolvedValue({ programs: [makeCustomProgram()] });
    const { Wrapper } = setup();
    const { result } = renderHook(() => useCustomRunPrograms(), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.programs).toHaveLength(1));
    expect(result.current.programs[0]?.name).toBe('My tempo plan');
  });
});

describe('useSaveRunProgramMutation', () => {
  beforeEach(() => jest.resetAllMocks());

  it('keeps the cached program in step and refreshes the dependent families', async () => {
    const updated = makeRunProgram({ next_index: 1 });
    mockSave.mockResolvedValue({ program: updated });
    const { queryClient, invalidate, Wrapper } = setup();
    const { result } = renderHook(() => useSaveRunProgramMutation(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        program_id: 'beginner5k',
        next_index: 1,
      });
    });

    expect(mockSave).toHaveBeenCalledWith({
      program_id: 'beginner5k',
      next_index: 1,
    });
    expect(queryClient.getQueryData(runProgramKeys.current())).toEqual(updated);
    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(runProgramKeys.all);
    expect(keys).toContainEqual(['workoutPlanTemplates']);
    expect(keys).toContainEqual(exerciseEntryKeys.all);
    expect(keys).toContainEqual(dailyProgressKeys.all);
  });

  it('builds each change from the program the one before it left', async () => {
    const first = makeRunProgram({ run_days: [] });
    const afterMonday = makeRunProgram({ run_days: [1] });
    const afterWednesday = makeRunProgram({ run_days: [1, 3] });
    mockSave
      .mockResolvedValueOnce({ program: afterMonday })
      .mockResolvedValueOnce({ program: afterWednesday });
    const { queryClient, Wrapper } = setup();
    queryClient.setQueryData<RunProgramResponse | null>(
      runProgramKeys.current(),
      first
    );
    const { result } = renderHook(() => useSaveRunProgramMutation(), {
      wrapper: Wrapper,
    });

    // Both taps land before either response does.
    await act(async () => {
      const a = result.current.mutateAsync((p) =>
        p ? toggleDayBody(p, 1) : null
      );
      const b = result.current.mutateAsync((p) =>
        p ? toggleDayBody(p, 3) : null
      );
      await Promise.all([a, b]);
    });

    expect(mockSave).toHaveBeenNthCalledWith(1, {
      program_id: 'beginner5k',
      run_days: [1],
    });
    expect(mockSave).toHaveBeenNthCalledWith(2, {
      program_id: 'beginner5k',
      run_days: [1, 3],
    });
  });

  it('sends nothing when the change has nothing to build on', async () => {
    const { Wrapper } = setup();
    const { result } = renderHook(() => useSaveRunProgramMutation(), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync(() => null);
    });
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe('useCompleteRunProgramWorkoutMutation', () => {
  beforeEach(() => jest.resetAllMocks());

  it('marks the workout done and stores the program the server returns', async () => {
    const updated = makeRunProgram({
      next_index: 1,
      last_done_date: '2026-10-14',
    });
    mockComplete.mockResolvedValue({ program: updated });
    const { queryClient, invalidate, Wrapper } = setup();
    const { result } = renderHook(
      () => useCompleteRunProgramWorkoutMutation(),
      {
        wrapper: Wrapper,
      }
    );

    await act(async () => {
      await result.current.mutateAsync({
        index: 0,
        program_id: 'beginner5k',
        day: '2026-10-14',
      });
    });

    expect(mockComplete).toHaveBeenCalledWith({
      index: 0,
      program_id: 'beginner5k',
      day: '2026-10-14',
    });
    expect(queryClient.getQueryData(runProgramKeys.current())).toEqual(updated);
    expect(
      invalidate.mock.calls.map((call) => call[0]?.queryKey)
    ).toContainEqual(runProgramKeys.all);
  });
});
