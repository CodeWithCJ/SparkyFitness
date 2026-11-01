import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import i18n from 'i18next';
import type { SavePlateInventoryBody } from '@workspace/shared';
import {
  deletePlateInventory,
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
