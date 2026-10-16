import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import * as medicationService from '@/api/Medications/medicationService';
import { reportKeys } from '@/api/keys/reports';
import { dailyProgressKeys, diaryReportKeys } from '@/api/keys/diary';
import type {
  Medication,
  ListMedicationsOptions,
  LogInjectionInput,
  UpdateInjectionInput,
  UpdateTitrationStepInput,
  MedicationPen,
  MedicationSchedule,
  TitrationStep,
  CreateMedicationEntryInput,
  UpdateMedicationEntryInput,
  ListMedicationEntriesOptions,
} from '@/types/medications';

import i18n from 'i18next';
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

// The Reports > Medications tab bundles medications/entries/injections/titration
// into one query keyed under reportKeys.all — a different key namespace from the
// ones above, so it never gets invalidated by the invalidations below on its own.
// Call this from any mutation that changes data surfaced there so the report
// refreshes without a manual page reload. refetchType: 'all' also refreshes the
// cache while the Reports tab isn't mounted (e.g. editing from Cabinet or Symptoms).
const invalidateReports = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({
    queryKey: reportKeys.all,
    refetchType: 'all',
  });

// A supplement dose contributes its nutrient payload to the day's totals, so logging,
// editing or undoing one moves the Diary's calories/macros and goal progress just as a
// food entry does. Medication mutations historically touched only medication + report
// keys, which left a cached Diary summary showing pre-dose numbers until it went stale.
// Scoped to the diary summary keys rather than the blanket diary invalidation, since
// nothing here can affect exercise, water or check-in data.
const invalidateDiaryTotals = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({
    queryKey: dailyProgressKeys.all,
    refetchType: 'all',
  });
  queryClient.invalidateQueries({
    queryKey: diaryReportKeys.nutritionTrends(),
    refetchType: 'all',
  });
};

// --- Queries ---------------------------------------------------------------

export const useMedications = (
  opts?: ListMedicationsOptions,
  options?: { enabled?: boolean }
) =>
  useQuery({
    queryKey: medKeys.list(opts),
    queryFn: () => medicationService.listMedications(opts),
    enabled: options?.enabled ?? true,
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.failedToLoadMedications',
        'Failed to load medications.'
      ),
    },
  });

export const useMedicationPens = (medId: string) =>
  useQuery({
    queryKey: medKeys.pens(medId),
    queryFn: () => medicationService.listPens(medId),
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.failedToLoadPensVials',
        'Failed to load pens/vials.'
      ),
    },
  });

export const useMedicationInjections = (medId: string) =>
  useQuery({
    queryKey: medKeys.injections(medId),
    queryFn: () => medicationService.listInjections(medId),
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.failedToLoadInjections',
        'Failed to load injections.'
      ),
    },
  });

export const useMedicationTitration = (medId: string) =>
  useQuery({
    queryKey: medKeys.titration(medId),
    queryFn: () => medicationService.listTitration(medId),
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.failedToLoadTitrationPlan',
        'Failed to load titration plan.'
      ),
    },
  });

export const useAddTitrationStepMutation = (medId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<TitrationStep> & { dose_mg: number }) =>
      medicationService.addTitrationStep(medId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: medKeys.titration(medId) });
      invalidateReports(queryClient);
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.couldNotAddTitrationStep',
        'Could not add titration step.'
      ),
      successMessage: i18n.t(
        'hooks.useMedications.titrationStepAdded',
        'Titration step added.'
      ),
    },
  });
};

export const useUpdateTitrationStepMutation = (medId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpdateTitrationStepInput;
    }) => medicationService.updateTitrationStep(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: medKeys.titration(medId) });
      invalidateReports(queryClient);
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.couldNotUpdateTitrationStep',
        'Could not update titration step.'
      ),
      successMessage: i18n.t(
        'hooks.useMedications.titrationStepUpdated',
        'Titration step updated.'
      ),
    },
  });
};

export const useDeleteTitrationStepMutation = (medId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => medicationService.deleteTitrationStep(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: medKeys.titration(medId) });
      invalidateReports(queryClient);
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.couldNotRemoveTitrationStep',
        'Could not remove titration step.'
      ),
    },
  });
};

export const useSerumCurve = (medId: string) =>
  useQuery({
    queryKey: medKeys.serumCurve(medId),
    queryFn: () => medicationService.getSerumCurve(medId),
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.failedToLoadSerumCurve',
        'Failed to load serum curve.'
      ),
    },
  });

export const useSiteSuggestion = (medId: string) =>
  useQuery({
    queryKey: medKeys.siteSuggestion(medId),
    queryFn: () => medicationService.getSiteSuggestion(medId),
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.failedToLoadSiteSuggestion',
        'Failed to load site suggestion.'
      ),
    },
  });

// --- Mutations -------------------------------------------------------------

export const useCreateMedicationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Medication> & { name: string }) =>
      medicationService.createMedication(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      invalidateReports(queryClient);
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.couldNotAddMedication',
        'Could not add medication.'
      ),
      successMessage: i18n.t(
        'hooks.useMedications.medicationAdded',
        'Medication added.'
      ),
    },
  });
};

export const useUpdateMedicationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Medication> }) =>
      medicationService.updateMedication(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      invalidateReports(queryClient);
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.couldNotUpdateMedication',
        'Could not update medication.'
      ),
      successMessage: i18n.t(
        'hooks.useMedications.medicationUpdated',
        'Medication updated.'
      ),
    },
  });
};

export const useDeleteMedicationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => medicationService.deleteMedication(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      invalidateReports(queryClient);
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.couldNotRemoveMedication',
        'Could not remove medication.'
      ),
      successMessage: i18n.t(
        'hooks.useMedications.medicationRemoved',
        'Medication removed.'
      ),
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
      // Injections are merged into the adherence feed, so the Log tab must refresh too.
      queryClient.invalidateQueries({
        queryKey: ['medication-entries'],
        refetchType: 'all',
      });
      invalidateReports(queryClient);
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.couldNotLogInjection',
        'Could not log injection.'
      ),
      successMessage: i18n.t(
        'hooks.useMedications.injectionLogged',
        'Injection logged.'
      ),
    },
  });
};

export const useUpdateInjectionMutation = (medId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateInjectionInput }) =>
      medicationService.updateInjection(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: medKeys.injections(medId) });
      queryClient.invalidateQueries({ queryKey: medKeys.serumCurve(medId) });
      queryClient.invalidateQueries({
        queryKey: medKeys.siteSuggestion(medId),
      });
      queryClient.invalidateQueries({
        queryKey: ['medication-entries'],
        refetchType: 'all',
      });
      invalidateReports(queryClient);
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.couldNotUpdateInjectionEntry',
        'Could not update injection entry.'
      ),
      successMessage: i18n.t(
        'hooks.useMedications.injectionEntryUpdated',
        'Injection entry updated.'
      ),
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
      queryClient.invalidateQueries({
        queryKey: ['medication-entries'],
        refetchType: 'all',
      });
      invalidateReports(queryClient);
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.couldNotRemoveInjectionEntry',
        'Could not remove injection entry.'
      ),
      successMessage: i18n.t(
        'hooks.useMedications.injectionEntryRemoved',
        'Injection entry removed.'
      ),
    },
  });
};

// Med-agnostic injection mutations for the Log tab, where GLP-1 injectable doses are
// logged as injections (single source of truth) instead of adherence entries. The server
// auto-picks the pen and resolves the dose; prefix invalidation covers every medication's
// Cabinet queries since the Log tab spans medications.
export const useLogGlpInjectionEntryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LogInjectionInput) =>
      medicationService.logInjection(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medication-injections'] });
      queryClient.invalidateQueries({ queryKey: ['medication-pens'] });
      queryClient.invalidateQueries({ queryKey: ['glp1-serum-curve'] });
      queryClient.invalidateQueries({ queryKey: ['glp1-site-suggestion'] });
      queryClient.invalidateQueries({
        queryKey: ['medication-entries'],
        refetchType: 'all',
      });
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      invalidateReports(queryClient);
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.couldNotLogInjection',
        'Could not log injection.'
      ),
      successMessage: i18n.t(
        'hooks.useMedications.injectionLogged',
        'Injection logged.'
      ),
    },
  });
};

export const useUpdateInjectionEntryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateInjectionInput }) =>
      medicationService.updateInjection(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medication-injections'] });
      queryClient.invalidateQueries({ queryKey: ['glp1-serum-curve'] });
      queryClient.invalidateQueries({ queryKey: ['glp1-site-suggestion'] });
      queryClient.invalidateQueries({
        queryKey: ['medication-entries'],
        refetchType: 'all',
      });
      invalidateReports(queryClient);
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.couldNotUpdateInjectionEntry',
        'Could not update injection entry.'
      ),
      successMessage: i18n.t(
        'hooks.useMedications.injectionEntryUpdated',
        'Injection entry updated.'
      ),
    },
  });
};

export const useDeleteInjectionEntryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => medicationService.deleteInjection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medication-injections'] });
      queryClient.invalidateQueries({ queryKey: ['medication-pens'] });
      queryClient.invalidateQueries({ queryKey: ['glp1-serum-curve'] });
      queryClient.invalidateQueries({ queryKey: ['glp1-site-suggestion'] });
      queryClient.invalidateQueries({
        queryKey: ['medication-entries'],
        refetchType: 'all',
      });
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      invalidateReports(queryClient);
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.couldNotRemoveInjectionEntry',
        'Could not remove injection entry.'
      ),
      successMessage: i18n.t(
        'hooks.useMedications.injectionEntryRemoved',
        'Injection entry removed.'
      ),
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
      errorMessage: i18n.t(
        'hooks.useMedications.couldNotAddPenVial',
        'Could not add pen/vial.'
      ),
      successMessage: i18n.t(
        'hooks.useMedications.penVialAdded',
        'Pen/vial added.'
      ),
    },
  });
};

export const useUpdatePenMutation = (medId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<MedicationPen> }) =>
      medicationService.updatePen(id, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: medKeys.pens(medId) }),
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.couldNotUpdatePenVial',
        'Could not update pen/vial.'
      ),
      successMessage: i18n.t(
        'hooks.useMedications.penVialUpdated',
        'Pen/vial updated.'
      ),
    },
  });
};

export const useDeletePenMutation = (medId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => medicationService.deletePen(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: medKeys.pens(medId) }),
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.couldNotRemovePenVial',
        'Could not remove pen/vial.'
      ),
      successMessage: i18n.t(
        'hooks.useMedications.penVialRemoved',
        'Pen/vial removed.'
      ),
    },
  });
};

// --- Entries & Adherence Queries & Mutations ------------------------------

export const useMedicationEntries = (opts?: ListMedicationEntriesOptions) =>
  useQuery({
    queryKey: medKeys.entries(opts),
    queryFn: () => medicationService.listMedicationEntries(opts),
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.failedToLoadLoggedDoses',
        'Failed to load logged doses.'
      ),
    },
  });

export const useCreateMedicationEntryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMedicationEntryInput) =>
      medicationService.createMedicationEntry(body),
    onSuccess: () => {
      // Invalidate both the entries list and general medications list (for medication details/schedules status)
      queryClient.invalidateQueries({
        queryKey: ['medication-entries'],
        refetchType: 'all',
      });
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      invalidateReports(queryClient);
      invalidateDiaryTotals(queryClient);
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.couldNotLogDose',
        'Could not log dose.'
      ),
      successMessage: i18n.t('hooks.useMedications.doseLogged', 'Dose logged.'),
    },
  });
};

export const useUpdateMedicationEntryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpdateMedicationEntryInput;
    }) => medicationService.updateMedicationEntry(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['medication-entries'],
        refetchType: 'all',
      });
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      invalidateReports(queryClient);
      invalidateDiaryTotals(queryClient);
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.couldNotUpdateLoggedDose',
        'Could not update logged dose.'
      ),
      successMessage: i18n.t(
        'hooks.useMedications.loggedDoseUpdated',
        'Logged dose updated.'
      ),
    },
  });
};

export const useDeleteMedicationEntryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => medicationService.deleteMedicationEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['medication-entries'],
        refetchType: 'all',
      });
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      invalidateReports(queryClient);
      invalidateDiaryTotals(queryClient);
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.couldNotRemoveLoggedDose',
        'Could not remove logged dose.'
      ),
      successMessage: i18n.t(
        'hooks.useMedications.loggedDoseRemoved',
        'Logged dose removed.'
      ),
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
      invalidateReports(queryClient);
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.couldNotAddSchedule',
        'Could not add schedule.'
      ),
      successMessage: i18n.t(
        'hooks.useMedications.scheduleAdded',
        'Schedule added.'
      ),
    },
  });
};

export const useDeleteScheduleMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => medicationService.deleteSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      invalidateReports(queryClient);
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useMedications.couldNotDeleteSchedule',
        'Could not delete schedule.'
      ),
      successMessage: i18n.t(
        'hooks.useMedications.scheduleDeleted',
        'Schedule deleted.'
      ),
    },
  });
};
