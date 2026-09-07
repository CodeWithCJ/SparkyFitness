import { waterContainerKeys } from '@/api/keys/settings';
import {
  getWaterContainers,
  createWaterContainer,
  deleteWaterContainer,
  setPrimaryWaterContainer,
} from '@/api/Settings/waterContainerService';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';

export const useWaterContainersQuery = (userId?: string) => {
  return useQuery({
    queryKey: waterContainerKeys.lists(),
    queryFn: getWaterContainers,
    meta: {
      errorMessage: 'Failed to fetch water containers.',
    },
    enabled: !!userId,
  });
};

export const useCreateWaterContainerMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createWaterContainer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: waterContainerKeys.all });
    },
    meta: {
      successMessage: 'Water container added.',
      errorMessage: 'Failed to add water container.',
    },
  });
};

export const useDeleteWaterContainerMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteWaterContainer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: waterContainerKeys.all });
    },
    meta: {
      successMessage: 'Water container deleted.',
      errorMessage: 'Failed to delete water container.',
    },
  });
};

export const useSetPrimaryWaterContainerMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: setPrimaryWaterContainer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: waterContainerKeys.all });
    },
    meta: {
      successMessage: 'Primary container updated.',
      errorMessage: 'Failed to set primary container.',
    },
  });
};
