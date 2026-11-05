import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  inventoryConfigFrom,
  type PlateInventoryConfig,
  type PlateUnit,
  type SavePlateInventoryBody,
} from '@workspace/shared';
import {
  activateGym,
  createGym,
  deleteGym,
  deletePlateInventory,
  fetchGyms,
  fetchPlateInventory,
  savePlateInventory,
} from '../services/api/plateInventoryApi';
import { gymsQueryKey, plateInventoryQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/**
 * The person's plates and bars. Until something is saved this is the standard
 * set for `fallbackUnit`, so the calculator works with nothing set up.
 */
export function usePlateInventory(fallbackUnit: PlateUnit) {
  const query = useQuery({
    queryKey: plateInventoryQueryKey,
    queryFn: fetchPlateInventory,
  });

  useRefetchOnFocus(query.refetch);

  const stored = query.data?.inventory ?? null;
  const gymFields = useMemo(
    () => ({
      id: stored?.id ?? null,
      name: stored?.name ?? null,
      dumbbells: stored?.dumbbells ?? [],
      machineStacks: stored?.machine_stacks ?? [],
    }),
    [stored]
  );
  // Stable between renders so the calculator memos that depend on it hold.
  const inventory = useMemo<PlateInventoryConfig>(
    () => inventoryConfigFrom(stored, fallbackUnit),
    [stored, fallbackUnit]
  );

  return {
    inventory,
    hasSaved: stored != null,
    gymFields,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function usePlateInventoryMutations() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: [...plateInventoryQueryKey],
    });
    void queryClient.invalidateQueries({ queryKey: [...gymsQueryKey] });
  };

  const saveMutation = useMutation({
    mutationFn: (data: SavePlateInventoryBody) => savePlateInventory(data),
    onSuccess: refresh,
  });
  const resetMutation = useMutation({
    mutationFn: deletePlateInventory,
    onSuccess: refresh,
  });

  const createGymMutation = useMutation({
    mutationFn: (data: SavePlateInventoryBody) => createGym(data),
    onSuccess: refresh,
  });
  const activateGymMutation = useMutation({
    mutationFn: (id: string) => activateGym(id),
    onSuccess: refresh,
  });
  const deleteGymMutation = useMutation({
    mutationFn: (id: string) => deleteGym(id),
    onSuccess: refresh,
  });

  return {
    saveMutation,
    resetMutation,
    createGymMutation,
    activateGymMutation,
    deleteGymMutation,
  };
}

/**
 * The person's gym profiles. Empty (and `supported` false) against a server
 * from before gym profiles, so the gym switcher just doesn't show.
 */
export function useGyms() {
  const query = useQuery({
    queryKey: gymsQueryKey,
    queryFn: fetchGyms,
    retry: false,
  });
  return {
    gyms: query.data?.gyms ?? [],
    supported: query.isSuccess,
  };
}
