import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import i18n from 'i18next';
import type { SavePlateInventoryBody } from '@workspace/shared';
import {
  activateGym,
  createGym,
  deleteGym,
  deletePlateInventory,
  fetchActiveGymQuietly,
  fetchGyms,
  fetchPlateInventory,
  savePlateInventory,
} from '@/api/PlateInventory/plateInventoryService';
import { plateInventoryKeys } from '@/api/keys/plateInventory';
import { useActiveUser } from '@/contexts/ActiveUserContext';

// The inventory is the signed-in person's own; the server refuses anyone acting
// on their behalf, so skip the request (and its error toast) and let callers
// fall back to the standard set.
export const usePlateInventory = () => {
  const { isActingOnBehalf } = useActiveUser();
  return useQuery({
    queryKey: plateInventoryKeys.all,
    queryFn: fetchPlateInventory,
    enabled: !isActingOnBehalf,
    select: (data) => data.inventory,
    meta: {
      errorMessage: i18n.t(
        'plates.failedToLoad',
        'Failed to load your plates and bars.'
      ),
    },
  });
};

export const useSavePlateInventoryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SavePlateInventoryBody) => savePlateInventory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: plateInventoryKeys.all });
    },
    meta: {
      successMessage: i18n.t('plates.saved', 'Plates and bars saved.'),
      errorMessage: i18n.t(
        'plates.failedToSave',
        'Failed to save plates and bars.'
      ),
    },
  });
};

export const useResetPlateInventoryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePlateInventory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: plateInventoryKeys.all });
    },
    meta: {
      successMessage: i18n.t('plates.reset', 'Plates and bars reset.'),
      errorMessage: i18n.t(
        'plates.failedToReset',
        'Failed to reset plates and bars.'
      ),
    },
  });
};

/**
 * The person's gym profiles. A server from before gym profiles has no such
 * route; the query then fails quietly (no toast, no retry) and callers hide
 * the gym controls.
 */
export const useGyms = () => {
  const { isActingOnBehalf } = useActiveUser();
  return useQuery({
    queryKey: plateInventoryKeys.gyms,
    queryFn: fetchGyms,
    enabled: !isActingOnBehalf,
    retry: false,
    select: (data) => data.gyms,
  });
};

const useGymMutation = <TVariables>(
  mutationFn: (variables: TVariables) => Promise<unknown>,
  successMessage: string
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      // The gyms key sits under `all`, so both refresh.
      queryClient.invalidateQueries({ queryKey: plateInventoryKeys.all });
    },
    meta: {
      successMessage,
      errorMessage: i18n.t('plates.gym.changeFailed', 'Could not change gyms'),
    },
  });
};

export const useCreateGymMutation = () =>
  useGymMutation(
    (data: SavePlateInventoryBody) => createGym(data),
    i18n.t('plates.gym.added', 'Gym added.')
  );

export const useActivateGymMutation = () =>
  useGymMutation(
    (id: string) => activateGym(id),
    i18n.t('plates.gym.switched', 'Gym switched.')
  );

export const useDeleteGymMutation = () =>
  useGymMutation(
    (id: string) => deleteGym(id),
    i18n.t('plates.gym.deleted', 'Gym deleted.')
  );

/**
 * The active gym for rounding progressed weights, or null when there is
 * none or it can't be read (older server, a delegate). Never toasts.
 */
export const fetchActiveGymForProgression = () =>
  fetchActiveGymQuietly()
    .then((response) => response.inventory)
    .catch(() => null);
