import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchWaterContainers,
  createWaterContainer,
  updateWaterContainer,
  deleteWaterContainer,
  setPrimaryWaterContainer,
  reorderWaterContainers,
  fetchDrinkPresetCatalog,
  addDrinkPreset,
} from '../services/api/measurementsApi';
import type { WaterContainer } from '../types/measurements';
import type {
  CreateWaterContainerBody,
  UpdateWaterContainerBody,
} from '@workspace/shared';
import { waterContainersQueryKey, dailySummaryRootQueryKey } from './queryKeys';

const EMPTY_CONTAINERS: WaterContainer[] = [];

export function useWaterContainersQuery(options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: waterContainersQueryKey,
    queryFn: fetchWaterContainers,
    // Mobile's Infinity-staleTime default means every mutation below must
    // invalidate this explicitly -- see useInvalidateWaterContainers.
    staleTime: Infinity,
    enabled: options?.enabled ?? true,
  });

  return {
    containers: query.data ?? EMPTY_CONTAINERS,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useDrinkPresetCatalogQuery(options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: ['drinkPresetCatalog'] as const,
    queryFn: fetchDrinkPresetCatalog,
    // The catalog is static reference data shipped with the server build.
    staleTime: Infinity,
    enabled: options?.enabled ?? true,
  });

  return {
    catalog: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/**
 * Every water-container mutation invalidates both the container list and
 * every cached daily summary: a factor or link change alters a day's water
 * total, and mobile's staleTime: Infinity means nothing refetches on its own
 * otherwise (see AGENTS.md "React Query And Local State").
 */
function useInvalidateWaterContainers() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: waterContainersQueryKey });
    queryClient.invalidateQueries({ queryKey: dailySummaryRootQueryKey });
  };
}

export function useCreateWaterContainerMutation() {
  const invalidate = useInvalidateWaterContainers();
  const mutation = useMutation({
    mutationFn: (body: CreateWaterContainerBody) => createWaterContainer(body),
    onSuccess: invalidate,
  });

  return {
    createWaterContainerAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

export function useUpdateWaterContainerMutation() {
  const invalidate = useInvalidateWaterContainers();
  const mutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: UpdateWaterContainerBody;
    }) => updateWaterContainer(id, body),
    onSuccess: invalidate,
  });

  return {
    updateWaterContainerAsync: (id: number, body: UpdateWaterContainerBody) =>
      mutation.mutateAsync({ id, body }),
    isPending: mutation.isPending,
  };
}

export function useDeleteWaterContainerMutation() {
  const invalidate = useInvalidateWaterContainers();
  const mutation = useMutation({
    mutationFn: (id: number) => deleteWaterContainer(id),
    onSuccess: invalidate,
  });

  return {
    deleteWaterContainerAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

export function useSetPrimaryWaterContainerMutation() {
  const invalidate = useInvalidateWaterContainers();
  const mutation = useMutation({
    mutationFn: (id: number) => setPrimaryWaterContainer(id),
    onSuccess: invalidate,
  });

  return {
    setPrimaryWaterContainerAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

export function useReorderWaterContainersMutation() {
  const invalidate = useInvalidateWaterContainers();
  const mutation = useMutation({
    mutationFn: (containerIds: number[]) =>
      reorderWaterContainers(containerIds),
    onSuccess: invalidate,
  });

  return {
    reorderWaterContainersAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

export function useAddDrinkPresetMutation() {
  const invalidate = useInvalidateWaterContainers();
  const mutation = useMutation({
    mutationFn: (catalogId: string) => addDrinkPreset(catalogId),
    onSuccess: invalidate,
  });

  return {
    addDrinkPresetAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}
