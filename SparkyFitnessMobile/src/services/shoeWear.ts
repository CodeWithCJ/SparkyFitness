import type { ShoeResponse } from '@workspace/shared';
import { fetchShoes } from './api/shoesApi';

/**
 * Looks up a pair after a run was linked to it and returns it when that run
 * took it to its retire-at distance, so the person can be asked whether to
 * retire it. `wasWornOut` is the state before the run: a pair that was
 * already over its limit is not asked about again on every run.
 */
export async function findShoeThatReachedLimit(
  shoeId: string,
  wasWornOut: boolean
): Promise<ShoeResponse | null> {
  if (wasWornOut) return null;
  const shoes = await fetchShoes('active');
  const shoe = shoes.find((candidate) => candidate.id === shoeId);
  return shoe?.is_worn_out ? shoe : null;
}
