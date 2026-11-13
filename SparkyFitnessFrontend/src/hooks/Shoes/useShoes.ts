import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import i18n from 'i18next';
import type {
  CreateShoeBody,
  ShoeStatus,
  UpdateShoeBody,
} from '@workspace/shared';
import {
  assignShoeToEntry,
  createShoe,
  deleteShoe,
  fetchShoes,
  updateShoe,
} from '@/api/Shoes/shoeService';
import { shoeKeys } from '@/api/keys/shoes';
import { exerciseEntryKeys } from '@/api/keys/exercises';

export const useShoes = (status?: ShoeStatus) =>
  useQuery({
    queryKey: shoeKeys.list(status),
    queryFn: () => fetchShoes(status),
    meta: {
      errorMessage: i18n.t('shoes.failedToLoad', 'Failed to load shoes.'),
    },
  });

export const useCreateShoeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateShoeBody) => createShoe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shoeKeys.all });
    },
    meta: {
      successMessage: i18n.t('shoes.added', 'Shoe added.'),
      errorMessage: i18n.t('shoes.failedToSave', 'Failed to save shoe.'),
    },
  });
};

export const useUpdateShoeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateShoeBody }) =>
      updateShoe(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shoeKeys.all });
    },
    meta: {
      successMessage: i18n.t('shoes.updated', 'Shoe updated.'),
      errorMessage: i18n.t('shoes.failedToSave', 'Failed to save shoe.'),
    },
  });
};

export const useDeleteShoeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteShoe(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shoeKeys.all });
      // Entries keep their data but lose the link, so refresh the diary too.
      queryClient.invalidateQueries({ queryKey: exerciseEntryKeys.all });
    },
    meta: {
      successMessage: i18n.t('shoes.deleted', 'Shoe deleted.'),
      errorMessage: i18n.t('shoes.failedToDelete', 'Failed to delete shoe.'),
    },
  });
};

export const useAssignShoeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      exerciseEntryId,
      shoeId,
    }: {
      exerciseEntryId: string;
      shoeId: string | null;
    }) => assignShoeToEntry(exerciseEntryId, shoeId),
    onSuccess: () => {
      // Mileage is derived from linked entries.
      queryClient.invalidateQueries({ queryKey: shoeKeys.all });
      queryClient.invalidateQueries({ queryKey: exerciseEntryKeys.all });
    },
    meta: {
      errorMessage: i18n.t(
        'shoes.failedToAssign',
        'Failed to update the shoe for this run.'
      ),
    },
  });
};
