import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as medicationService from '@/api/Medications/medicationService';
import type {
  Medication,
  ListMedicationsOptions,
  LogInjectionInput,
  MedicationPen,
  MedicationSchedule,
  TitrationStep,
  CreateMedicationEntryInput,
  ListMedicationEntriesOptions,
} from '@/types/medications';

const medKeys = {
  list: (opts?: ListMedicationsOptions) => ['medications', opts ?? {}] as const,
  pens: (medId: string) => ['medication-pens', medId] as const,
  injections: (medId: string) => ['medication-injections', medId] as const,
  titration: (medId: string) => ['medication-titration', medId] as const,
  serumCurve: (medId: string) => ['glp1-serum-curve', medId] as const,
  siteSuggestion: (medId: string) => ['glp1-site-suggestion', medId] as const,
  entries: (opts?: ListMedicationEntriesOptions) =>
    ['medication-entries', opts ?? {}] as const,
};

// --- Queries ---------------------------------------------------------------

export const useMedications = (opts?: ListMedicationsOptions) =>
  useQuery({
    queryKey: medKeys.list(opts),
    queryFn: () => medicationService.listMedications(opts),
    meta: { errorMessage: 'Failed to load medications.' },
  });

export const useMedicationPens = (medId: string) =>
  useQuery({
    queryKey: medKeys.pens(medId),
    queryFn: () => medicationService.listPens(medId),
    meta: { errorMessage: 'Failed to load pens/vials.' },
  });

export const useMedicationInjections = (medId: string) =>
  useQuery({
    queryKey: medKeys.injections(medId),
    queryFn: () => medicationService.listInjections(medId),
    meta: { errorMessage: 'Failed to load injections.' },
  });

export const useMedicationTitration = (medId: string) =>
  useQuery({
    queryKey: medKeys.titration(medId),
    queryFn: () => medicationService.listTitration(medId),
    meta: { errorMessage: 'Failed to load titration plan.' },
  });

export const useAddTitrationStepMutation = (medId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<TitrationStep> & { dose_mg: number }) =>
      medicationService.addTitrationStep(medId, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: medKeys.titration(medId) }),
    meta: {
      errorMessage: 'Could not add titration step.',
      successMessage: 'Titration step added.',
    },
  });
};

export const useDeleteTitrationStepMutation = (medId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => medicationService.deleteTitrationStep(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: medKeys.titration(medId) }),
    meta: { errorMessage: 'Could not remove titration step.' },
  });
};

export const useSerumCurve = (medId: string) =>
  useQuery({
    queryKey: medKeys.serumCurve(medId),
    queryFn: () => medicationService.getSerumCurve(medId),
    meta: { errorMessage: 'Failed to load serum curve.' },
  });

export const useSiteSuggestion = (medId: string) =>
  useQuery({
    queryKey: medKeys.siteSuggestion(medId),
    queryFn: () => medicationService.getSiteSuggestion(medId),
    meta: { errorMessage: 'Failed to load site suggestion.' },
  });

// --- Mutations -------------------------------------------------------------

export const useCreateMedicationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Medication> & { name: string }) =>
      medicationService.createMedication(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['medications'] }),
    meta: {
      errorMessage: 'Could not add medication.',
      successMessage: 'Medication added.',
    },
  });
};

export const useUpdateMedicationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Medication> }) =>
      medicationService.updateMedication(id, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['medications'] }),
    meta: {
      errorMessage: 'Could not update medication.',
      successMessage: 'Medication updated.',
    },
  });
};

export const useDeleteMedicationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => medicationService.deleteMedication(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['medications'] }),
    meta: {
      errorMessage: 'Could not remove medication.',
      successMessage: 'Medication removed.',
    },
  });
};

export const useLogInjectionMutation = (medId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LogInjectionInput) =>
      medicationService.logInjection(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: medKeys.injections(medId) });
      queryClient.invalidateQueries({ queryKey: medKeys.pens(medId) });
      queryClient.invalidateQueries({ queryKey: medKeys.serumCurve(medId) });
      queryClient.invalidateQueries({
        queryKey: medKeys.siteSuggestion(medId),
      });
    },
    meta: {
      errorMessage: 'Could not log injection.',
      successMessage: 'Injection logged.',
    },
  });
};

export const useDeleteInjectionMutation = (medId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => medicationService.deleteInjection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: medKeys.injections(medId) });
      queryClient.invalidateQueries({ queryKey: medKeys.pens(medId) });
      queryClient.invalidateQueries({ queryKey: medKeys.serumCurve(medId) });
      queryClient.invalidateQueries({
        queryKey: medKeys.siteSuggestion(medId),
      });
    },
    meta: {
      errorMessage: 'Could not remove injection entry.',
      successMessage: 'Injection entry removed.',
    },
  });
};

export const useCreatePenMutation = (medId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<MedicationPen>) =>
      medicationService.createPen(medId, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: medKeys.pens(medId) }),
    meta: {
      errorMessage: 'Could not add pen/vial.',
      successMessage: 'Pen/vial added.',
    },
  });
};

// --- Entries & Adherence Queries & Mutations ------------------------------

export const useMedicationEntries = (opts?: ListMedicationEntriesOptions) =>
  useQuery({
    queryKey: medKeys.entries(opts),
    queryFn: () => medicationService.listMedicationEntries(opts),
    meta: { errorMessage: 'Failed to load logged doses.' },
  });

export const useCreateMedicationEntryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMedicationEntryInput) =>
      medicationService.createMedicationEntry(body),
    onSuccess: () => {
      // Invalidate both the entries list and general medications list (for medication details/schedules status)
      queryClient.invalidateQueries({ queryKey: ['medication-entries'] });
      queryClient.invalidateQueries({ queryKey: ['medications'] });
    },
    meta: {
      errorMessage: 'Could not log dose.',
      successMessage: 'Dose logged.',
    },
  });
};

export const useDeleteMedicationEntryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => medicationService.deleteMedicationEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medication-entries'] });
      queryClient.invalidateQueries({ queryKey: ['medications'] });
    },
    meta: {
      errorMessage: 'Could not remove logged dose.',
      successMessage: 'Logged dose removed.',
    },
  });
};

// --- Schedule Mutations ---------------------------------------------------

export const useAddScheduleMutation = (medId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Partial<MedicationSchedule> & { schedule_type_id: string }
    ) => medicationService.addSchedule(medId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medications'] });
    },
    meta: {
      errorMessage: 'Could not add schedule.',
      successMessage: 'Schedule added.',
    },
  });
};

export const useDeleteScheduleMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => medicationService.deleteSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medications'] });
    },
    meta: {
      errorMessage: 'Could not delete schedule.',
      successMessage: 'Schedule deleted.',
    },
  });
};
