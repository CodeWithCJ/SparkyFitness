import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  storedProgramStatus,
  type CompleteRunProgramWorkoutBody,
  type CustomRunProgramResponse,
  type GetRunProgramResponse,
  type ProgramStatus,
  type RunProgramResponse,
  type UpsertRunProgramBody,
} from '@workspace/shared';
import { runProgramKeys } from '@/api/keys/runPrograms';
import {
  completeRunProgramWorkout,
  getCustomRunPrograms,
  getRunProgram,
  saveRunProgram,
} from '@/api/Exercises/runPrograms';
import { useRunProgramInvalidation } from '@/hooks/useInvalidateKeys';

/** Changes to the one program run one at a time, so quick taps build on each other. */
const RUN_PROGRAM_MUTATION_SCOPE = { id: 'run-program' };

const loadProgram = async (): Promise<RunProgramResponse | null> =>
  (await getRunProgram()).program;

export interface RunProgramState {
  /** The program as the server holds it, including its logs, or null. */
  program: RunProgramResponse | null;
  /** The place in the program, even while it is switched off. */
  status: ProgramStatus | null;
  /** Whether the person is using it. */
  enabled: boolean;
  schedule: {
    /** Weekdays (0 = Sunday); empty means every day. */
    days: number[];
    startDay: string | null;
    endDay: string | null;
  };
  /** The local day a program workout was last completed, or null. */
  doneDay: string | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * The person's run program. It lives on the server so the AI assistant and
 * the mobile app can change it too; this re-reads on mount and window focus.
 * Owner-only on the server, so it is not requested while acting for someone.
 */
export const useRunProgram = (enabled = true): RunProgramState => {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: runProgramKeys.current(),
    queryFn: loadProgram,
    enabled,
    staleTime: 0,
    meta: {
      errorMessage: t(
        'trainingPrograms.errors.load',
        'Could not load your training program.'
      ),
    },
  });
  const program = query.data ?? null;
  return useMemo(
    () => ({
      program,
      status: program ? storedProgramStatus(program) : null,
      enabled: program?.enabled ?? false,
      schedule: {
        days: program?.run_days ?? [],
        startDay: program?.start_date ?? null,
        endDay: program?.end_date ?? null,
      },
      doneDay: program?.last_done_date ?? null,
      isLoading: enabled && query.isLoading,
      isError: query.isError,
    }),
    [program, enabled, query.isLoading, query.isError]
  );
};

/** The person's own programs, newest first. */
export const useCustomRunPrograms = (
  enabled = true
): { programs: CustomRunProgramResponse[]; isLoading: boolean } => {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: runProgramKeys.custom(),
    queryFn: async () => (await getCustomRunPrograms()).programs,
    enabled,
    meta: {
      errorMessage: t(
        'trainingPrograms.errors.loadCustom',
        'Could not load your plans.'
      ),
    },
  });
  return { programs: query.data ?? [], isLoading: enabled && query.isLoading };
};

const useProgramCacheWriter = () => {
  const queryClient = useQueryClient();
  return (response: GetRunProgramResponse) => {
    // A read that began before this write must not land after it.
    void queryClient.cancelQueries({ queryKey: runProgramKeys.current() });
    queryClient.setQueryData(runProgramKeys.current(), response.program);
  };
};

/**
 * A change to the program: a ready body, or a function of the program as it
 * stands when the change runs. Changes run one at a time (see the mutation
 * scope), so a function sees the result of the one before it, which is what
 * makes two quick weekday taps both land.
 */
export type RunProgramChange =
  | UpsertRunProgramBody
  | ((current: RunProgramResponse | null) => UpsertRunProgramBody | null);

/**
 * Starts a program, switches it on or off, or moves within it. The bodies are
 * built by the `utils/runPrograms` helpers.
 */
export const useSaveRunProgramMutation = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const writeCache = useProgramCacheWriter();
  const invalidate = useRunProgramInvalidation();
  return useMutation({
    mutationFn: async (change: RunProgramChange) => {
      const body =
        typeof change === 'function'
          ? change(
              queryClient.getQueryData<RunProgramResponse | null>(
                runProgramKeys.current()
              ) ?? null
            )
          : change;
      // Nothing to change (the program went away between tap and run).
      if (!body) return null;
      return saveRunProgram(body);
    },
    scope: RUN_PROGRAM_MUTATION_SCOPE,
    onSuccess: (response) => {
      if (!response) return;
      writeCache(response);
      invalidate();
    },
    meta: {
      errorMessage: t(
        'trainingPrograms.errors.update',
        'Could not update your program. Please try again.'
      ),
    },
  });
};

/**
 * Marks workout `index` done. The server only moves on if it was the one due,
 * so a repeated request changes nothing.
 */
export const useCompleteRunProgramWorkoutMutation = () => {
  const { t } = useTranslation();
  const writeCache = useProgramCacheWriter();
  const invalidate = useRunProgramInvalidation();
  return useMutation({
    mutationFn: (body: CompleteRunProgramWorkoutBody) =>
      completeRunProgramWorkout(body),
    scope: RUN_PROGRAM_MUTATION_SCOPE,
    onSuccess: (response) => {
      writeCache(response);
      invalidate();
    },
    meta: {
      errorMessage: t(
        'trainingPrograms.errors.update',
        'Could not update your program. Please try again.'
      ),
    },
  });
};
