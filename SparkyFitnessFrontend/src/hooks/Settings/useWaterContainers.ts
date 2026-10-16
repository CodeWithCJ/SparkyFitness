import { waterContainerKeys } from '@/api/keys/settings';
import {
  getWaterContainers,
  getDrinkPresetCatalog,
  materializeDrinkPreset,
  createWaterContainer,
  updateWaterContainer,
  deleteWaterContainer,
  setPrimaryWaterContainer,
} from '@/api/Settings/waterContainerService';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';

import i18n from 'i18next';
export const useWaterContainersQuery = (userId?: string) => {
  return useQuery({
    queryKey: waterContainerKeys.lists(),
    queryFn: getWaterContainers,
    meta: {
      errorMessage: i18n.t(
        'hooks.useWaterContainers.failedToFetchWaterContainers',
        'Failed to fetch water containers.'
      ),
    },
    enabled: !!userId,
  });
};

export const useDrinkPresetCatalogQuery = () => {
  return useQuery({
    queryKey: ['water-containers', 'catalog'],
    queryFn: getDrinkPresetCatalog,
    meta: {
      errorMessage: i18n.t(
        'hooks.useWaterContainers.failedToFetchDrinkPreset',
        'Failed to fetch drink preset catalog.'
      ),
    },
  });
};

export const useMaterializeDrinkPresetMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (catalogId: string) => materializeDrinkPreset(catalogId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: waterContainerKeys.all });
    },
    meta: {
      successMessage: i18n.t(
        'hooks.useWaterContainers.drinkPresetAdded',
        'Drink preset added.'
      ),
      errorMessage: i18n.t(
        'hooks.useWaterContainers.failedToAddDrinkPreset',
        'Failed to add drink preset.'
      ),
    },
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
      successMessage: i18n.t(
        'hooks.useWaterContainers.waterContainerAdded',
        'Water container added.'
      ),
      errorMessage: i18n.t(
        'hooks.useWaterContainers.failedToAddWaterContainer',
        'Failed to add water container.'
      ),
    },
  });
};

export const useUpdateWaterContainerMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      containerData,
    }: {
      id: number;
      containerData: Parameters<typeof updateWaterContainer>[1];
    }) => updateWaterContainer(id, containerData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: waterContainerKeys.all });
    },
    meta: {
      successMessage: i18n.t(
        'hooks.useWaterContainers.waterContainerUpdated',
        'Water container updated.'
      ),
      errorMessage: i18n.t(
        'hooks.useWaterContainers.failedToUpdateWaterContainer',
        'Failed to update water container.'
      ),
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
      successMessage: i18n.t(
        'hooks.useWaterContainers.waterContainerDeleted',
        'Water container deleted.'
      ),
      errorMessage: i18n.t(
        'hooks.useWaterContainers.failedToDeleteWaterContainer',
        'Failed to delete water container.'
      ),
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
      successMessage: i18n.t(
        'hooks.useWaterContainers.primaryContainerUpdated',
        'Primary container updated.'
      ),
      errorMessage: i18n.t(
        'hooks.useWaterContainers.failedToSetPrimaryContainer',
        'Failed to set primary container.'
      ),
    },
  });
};
