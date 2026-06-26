import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as symptomService from '@/api/Medications/symptomService';
import type {
  SharedUserCustomSymptom,
  SharedSymptomEntry,
} from '@workspace/shared';

const symptomKeys = {
  custom: () => ['custom-symptoms'] as const,
  locations: () => ['custom-symptom-locations'] as const,
  entries: (opts?: {
    fromDate?: string;
    toDate?: string;
    symptomName?: string;
  }) => ['symptom-entries', opts ?? {}] as const,
};

// --- Queries ---------------------------------------------------------------

export const useCustomSymptoms = () =>
  useQuery({
    queryKey: symptomKeys.custom(),
    queryFn: () => symptomService.listCustomSymptoms(),
    meta: { errorMessage: 'Failed to load custom symptoms.' },
  });

export const useCustomLocations = () =>
  useQuery({
    queryKey: symptomKeys.locations(),
    queryFn: () => symptomService.listCustomLocations(),
    meta: { errorMessage: 'Failed to load custom locations.' },
  });

export const useCreateCustomLocationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => symptomService.createCustomLocation(name),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: symptomKeys.locations() }),
    meta: {
      errorMessage: 'Could not add location.',
      successMessage: 'Location added.',
    },
  });
};

export const useDeleteCustomLocationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => symptomService.deleteCustomLocation(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: symptomKeys.locations() }),
    meta: { errorMessage: 'Could not remove location.' },
  });
};

export const useSymptomEntries = (opts?: {
  fromDate?: string;
  toDate?: string;
  symptomName?: string;
}) =>
  useQuery({
    queryKey: symptomKeys.entries(opts),
    queryFn: () => symptomService.listSymptomEntries(opts),
    meta: { errorMessage: 'Failed to load symptom logs.' },
  });

// --- Mutations -------------------------------------------------------------

export const useCreateCustomSymptomMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<SharedUserCustomSymptom> & { name: string }) =>
      symptomService.createCustomSymptom(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: symptomKeys.custom() });
    },
    meta: {
      errorMessage: 'Could not add custom symptom.',
      successMessage: 'Custom symptom added.',
    },
  });
};

export const useDeleteCustomSymptomMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => symptomService.deleteCustomSymptom(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: symptomKeys.custom() });
    },
    meta: {
      errorMessage: 'Could not delete custom symptom.',
      successMessage: 'Custom symptom deleted.',
    },
  });
};

export const useCreateSymptomEntryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Partial<SharedSymptomEntry> & { symptom_name_snapshot: string }
    ) => symptomService.createSymptomEntry(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['symptom-entries'] });
    },
    meta: {
      errorMessage: 'Could not log symptom.',
      successMessage: 'Symptom logged.',
    },
  });
};

export const useDeleteSymptomEntryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => symptomService.deleteSymptomEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['symptom-entries'] });
    },
    meta: {
      errorMessage: 'Could not remove symptom log.',
      successMessage: 'Symptom log removed.',
    },
  });
};
