import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import {
  listMedications,
  getMedication,
  listEntries,
  createMedication,
  updateMedication,
  deleteMedication,
  createSchedule,
  updateSchedule,
  deleteSchedule,
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
import { invalidateMedicationEntryCaches } from './invalidateMedicationEntryCaches';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { entryMatchesDose, type DueDose } from '../utils/medications';
import { addLog } from '../services/LogService';
import type {
  CreateMedicationInput,
  UpdateMedicationInput,
  CreateMedicationEntryInput,
  UpdateMedicationEntryInput,
  CreateScheduleInput,
  UpdateScheduleInput,
  Medication,
  MedicationEntry,
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

export function useCreateMedicationSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ medicationId, body }: { medicationId: string; body: CreateScheduleInput }) =>
      createSchedule(medicationId, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: medicationsRootQueryKey });
      queryClient.invalidateQueries({ queryKey: medicationDetailQueryKey(variables.medicationId) });
    },
  });
}

export function useUpdateMedicationSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      medicationId: string;
      body: UpdateScheduleInput;
    }) => updateSchedule(id, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: medicationsRootQueryKey });
      queryClient.invalidateQueries({ queryKey: medicationDetailQueryKey(variables.medicationId) });
    },
  });
}

export function useDeleteMedicationSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; medicationId: string }) => deleteSchedule(id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: medicationsRootQueryKey });
      queryClient.invalidateQueries({ queryKey: medicationDetailQueryKey(variables.medicationId) });
    },
  });
}

export function useCreateMedicationEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMedicationEntryInput) => createEntry(body),
    onSuccess: () => {
      invalidateMedicationEntryCaches(queryClient);
    },
  });
}

export function useUpdateMedicationEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateMedicationEntryInput }) =>
      updateEntry(id, body),
    onSuccess: () => {
      invalidateMedicationEntryCaches(queryClient);
    },
  });
}

export function useDeleteMedicationEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteEntry(id),
    onSuccess: () => {
      invalidateMedicationEntryCaches(queryClient);
    },
  });
}

/**
 * Dose-logging actions shared by every surface that acts on dose slots.
 *
 * Semantics: repeating the same action undoes the log instead of
 * re-creating it; acting on a slot that already has a schedule-less
 * (web-logged) entry re-attributes that entry to the slot via update
 * rather than creating a duplicate. All actions show their own success
 * and error toasts.
 *
 * `entries` must cover `selectedDate` for the medications being acted on.
 */
export function useLogDose(selectedDate: string, entries: MedicationEntry[] | undefined) {
  const { t } = useTranslation();
  const createEntryMutation = useCreateMedicationEntry();
  const updateEntryMutation = useUpdateMedicationEntry();
  const deleteEntryMutation = useDeleteMedicationEntry();

  const entryForDue = useCallback(
    (due: DueDose) => entries?.find((e) => entryMatchesDose(e, due.medication.id, due.schedule.id)),
    [entries],
  );

  const showEntryError = useCallback((message: string, error: Error) => {
    addLog(`${message}: ${error.message}`, 'ERROR');
    Toast.show({ type: 'error', text1: message });
  }, []);

  const logDose = useCallback(
    (due: DueDose, status: 'taken' | 'skipped') => {
      const isTaken = status === 'taken';
      const existing = entryForDue(due);

      // Repeating the same action undoes the log instead of re-creating it.
      const undone = isTaken
        ? existing?.status === 'taken' || existing?.status === 'prn_taken'
        : existing?.status === 'skipped';
      const undoneMessage = isTaken
        ? t('medications.dose.unmarked', { defaultValue: '{{name}} unmarked', name: due.medication.name })
        : t('medications.dose.unskipped', { defaultValue: '{{name}} unskipped', name: due.medication.name });
      if (existing && undone) {
        deleteEntryMutation.mutate(existing.id, {
          onSuccess: () =>
            Toast.show({ type: 'info', text1: undoneMessage }),
          onError: (error) => showEntryError(t('medications.dose.failedUnmark', { defaultValue: 'Failed to unmark {{name}}', name: due.medication.name }), error),
        });
        return;
      }

      const loggedMessage = isTaken
        ? t('medications.dose.takenToast', { defaultValue: '{{name}} taken', name: due.medication.name })
        : t('medications.dose.skippedToast', { defaultValue: '{{name}} skipped', name: due.medication.name });
      const showLoggedToast = () =>
        Toast.show({
          type: isTaken ? 'success' : 'info',
          text1: loggedMessage,
        });

      if (existing) {
        // Re-attributes schedule-less (web-logged) entries to the slot being
        // acted on; taken_at records when the current status was set.
        updateEntryMutation.mutate(
          {
            id: existing.id,
            body: {
              schedule_id: due.schedule.id,
              status,
              taken_at: new Date().toISOString(),
            },
          },
          {
            onSuccess: showLoggedToast,
            onError: (error) => showEntryError(t('medications.dose.failedUpdate', { defaultValue: 'Failed to update {{name}}', name: due.medication.name }), error),
          },
        );
      } else {
        createEntryMutation.mutate(
          {
            medication_id: due.medication.id,
            schedule_id: due.schedule.id,
            status,
            entry_date: selectedDate,
            taken_at: isTaken ? new Date().toISOString() : undefined,
          },
          {
            onSuccess: showLoggedToast,
            onError: (error) => showEntryError(t('medications.dose.failedLog', { defaultValue: 'Failed to log {{name}}', name: due.medication.name }), error),
          },
        );
      }
    },
    [entryForDue, createEntryMutation, updateEntryMutation, deleteEntryMutation, selectedDate, showEntryError, t],
  );

  const toggleTaken = useCallback(
    (due: DueDose) => {
      const existing = entryForDue(due);
      if (existing) {
        deleteEntryMutation.mutate(existing.id, {
          onError: (error) => showEntryError(t('medications.dose.failedUnmark', { defaultValue: 'Failed to unmark {{name}}', name: due.medication.name }), error),
        });
        return;
      }
      logDose(due, 'taken');
    },
    [entryForDue, deleteEntryMutation, logDose, showEntryError, t],
  );

  // Unlike scheduled slots, a PRN log has no toggle surface to undo a
  // mis-tap, so the success toast itself is the undo affordance.
  const logPrn = useCallback(
    (med: Medication) => {
      createEntryMutation.mutate(
        {
          medication_id: med.id,
          status: 'prn_taken',
          entry_date: selectedDate,
          taken_at: new Date().toISOString(),
        },
        {
          onSuccess: (created) =>
            Toast.show({
              type: 'success',
              text1: t('medications.dose.logged', { defaultValue: '{{name}} logged', name: med.name }),
              text2: t('medications.dose.tapUndo', { defaultValue: 'Tap to undo' }),
              props: {
                onPress: () => {
                  Toast.hide();
                  deleteEntryMutation.mutate(created.id, {
                    onSuccess: () => Toast.show({ type: 'info', text1: t('medications.dose.removed', { defaultValue: '{{name}} dose removed', name: med.name }) }),
                    onError: (error) => showEntryError(t('medications.dose.failedRemoveDose', { defaultValue: 'Failed to remove {{name}} dose', name: med.name }), error),
                  });
                },
              },
            }),
          onError: (error) => showEntryError(t('medications.dose.failedLog', { defaultValue: 'Failed to log {{name}}', name: med.name }), error),
        },
      );
    },
    [createEntryMutation, deleteEntryMutation, selectedDate, showEntryError, t],
  );

  return { entryForDue, logDose, toggleTaken, logPrn };
}


