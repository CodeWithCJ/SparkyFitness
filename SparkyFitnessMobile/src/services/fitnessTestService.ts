import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  CreateFitnessTestBody,
  FitnessTestResponse,
} from '@workspace/shared';
import { queryClient } from '../hooks/queryClient';
import { fitnessTestsQueryKey } from '../hooks/queryKeys';
import {
  createFitnessTest,
  deleteFitnessTest,
  fetchFitnessTests,
} from './api/fitnessTestApi';

/**
 * The person's running fitness tests. They live on the server so the AI
 * assistant and every device read the same paces; this keeps the React Query
 * copy in step after each change.
 */

async function load(): Promise<FitnessTestResponse[]> {
  return (await fetchFitnessTests()).tests;
}

/** Tests newest first, and the latest one. */
export function useFitnessTests(enabled = true) {
  const query = useQuery({
    queryKey: fitnessTestsQueryKey,
    queryFn: load,
    enabled,
    // The assistant or another device may have added a test.
    staleTime: 30_000,
  });
  const tests = useMemo(() => query.data ?? [], [query.data]);
  return {
    tests,
    latest: tests[0] ?? null,
    loaded: query.data !== undefined,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

/** Saves a test and refreshes the list. */
export async function saveFitnessTest(
  body: CreateFitnessTestBody
): Promise<FitnessTestResponse> {
  const saved = await createFitnessTest(body);
  await queryClient.invalidateQueries({ queryKey: fitnessTestsQueryKey });
  return saved;
}

export async function removeFitnessTest(id: string): Promise<void> {
  await deleteFitnessTest(id);
  await queryClient.invalidateQueries({ queryKey: fitnessTestsQueryKey });
}
