import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listMedications,
  getMedication,
  listEntries,
  createMedication,
  updateMedication,
  deleteMedication,
  createEntry,
  updateEntry,
  deleteEntry,
} from '../services/api/medicationsApi';
import {
  medicationsRootQueryKey,
  medicationsListQueryKey,
  medicationDetailQueryKey,
  medicationEntriesQueryKey,
} from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import type {
  CreateMedicationInput,
  UpdateMedicationInput,
  CreateMedicationEntryInput,
  UpdateMedicationEntryInput,
} from '@workspace/shared';

interface QueryOptions {
  enabled?: boolean;
}

export function useMedications(opts?: { activeOnly?: boolean } & QueryOptions) {
  const { enabled, ...filters } = opts ?? {};
  const query = useQuery({
    queryKey: medicationsListQueryKey(filters),
    queryFn: () => listMedications(filters),
    enabled: enabled ?? true,
  });
  useRefetchOnFocus(query.refetch, enabled ?? true);
  return query;
}

export function useMedicationDetail(id: string, options?: QueryOptions) {
  const query = useQuery({
    queryKey: medicationDetailQueryKey(id),
    queryFn: () => getMedication(id),
    enabled: options?.enabled ?? true,
  });
  useRefetchOnFocus(query.refetch, options?.enabled ?? true);
  return query;
}

export function useMedicationEntries(
  opts?: { fromDate?: string; toDate?: string; medicationId?: string } & QueryOptions,
) {
  const { enabled, ...filters } = opts ?? {};
  const query = useQuery({
    queryKey: medicationEntriesQueryKey(filters),
    queryFn: () => listEntries(filters),
    enabled: enabled ?? true,
  });
  useRefetchOnFocus(query.refetch, enabled ?? true);
  return query;
}

export function useCreateMedication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMedicationInput) => createMedication(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: medicationsRootQueryKey });
    },
  });
}

export function useUpdateMedication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateMedicationInput }) =>
      updateMedication(id, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: medicationsRootQueryKey });
      queryClient.invalidateQueries({ queryKey: medicationDetailQueryKey(variables.id) });
    },
  });
}

export function useDeleteMedication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMedication(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: medicationsRootQueryKey });
    },
  });
}

export function useCreateMedicationEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMedicationEntryInput) => createEntry(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: medicationEntriesQueryKey() });
      queryClient.invalidateQueries({ queryKey: medicationsRootQueryKey });
    },
  });
}

export function useUpdateMedicationEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateMedicationEntryInput }) =>
      updateEntry(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: medicationEntriesQueryKey() });
      queryClient.invalidateQueries({ queryKey: medicationsRootQueryKey });
    },
  });
}

export function useDeleteMedicationEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: medicationEntriesQueryKey() });
      queryClient.invalidateQueries({ queryKey: medicationsRootQueryKey });
    },
  });
}


