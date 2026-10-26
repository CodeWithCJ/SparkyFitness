import { useQuery } from '@tanstack/react-query';
import { fetchFitnessTests } from '@/api/Exercises/fitnessTestService';
import { fitnessTestKeys } from '@/api/keys/fitnessTests';

/**
 * The person's fitness tests. They are personal training data, so the server
 * refuses them while acting on behalf of someone else; pass `enabled: false`
 * then rather than asking.
 */
export const useFitnessTests = (enabled: boolean = true) =>
  useQuery({
    queryKey: fitnessTestKeys.list(),
    queryFn: fetchFitnessTests,
    enabled,
    select: (data) => data.tests,
  });
