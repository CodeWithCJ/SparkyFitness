import { useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listPens,
  createPen,
  updatePen,
  deletePen,
  listInjections,
  logInjection,
  deleteInjection,
  listTitration,
  createTitrationStep,
  updateTitrationStep,
  deleteTitrationStep,
  getSerumCurve,
  getSiteSuggestion,
} from '../services/api/medicationsApi';
import {
  createCustomCategory,
  saveCustomMeasurement,
} from '../services/api/measurementsApi';
import {
  glp1PensQueryKey,
  glp1InjectionsQueryKey,
  glp1TitrationQueryKey,
  glp1SerumCurveQueryKey,
  glp1SiteSuggestionQueryKey,
  customCategoriesQueryKey,
  customMeasurementsByDateQueryKey,
  latestManualCustomEntriesRootQueryKey,
} from './queryKeys';
import {
  useCustomCategories,
  useCustomMeasurementsByDate,
} from './useCustomMeasurements';
import { invalidateMedicationEntryCaches } from './invalidateMedicationEntryCaches';
import { refreshHealthSyncCache } from './refreshHealthSyncCache';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import {
  GLP1_CHECKIN_METRICS,
  GLP1_CHECKIN_DEFAULT,
  type Glp1CheckInMetricKey,
} from '../utils/glp1';
import type { CustomCategory } from '../types/customMeasurements';
import type {
  LogInjectionInput,
  MedicationPen,
  TitrationStep,
  UpdateTitrationStepInput,
} from '@workspace/shared';

export function useMedicationPens(medicationId: string) {
  const query = useQuery({
    queryKey: glp1PensQueryKey(medicationId),
    queryFn: () => listPens(medicationId),
    enabled: !!medicationId,
  });
  useRefetchOnFocus(query.refetch, !!medicationId);
  return query;
}

export function useInjections(medicationId: string) {
  const query = useQuery({
    queryKey: glp1InjectionsQueryKey(medicationId),
    queryFn: () => listInjections(medicationId),
    enabled: !!medicationId,
  });
  useRefetchOnFocus(query.refetch, !!medicationId);
  return query;
}

export function useTitrationSteps(medicationId: string) {
  const query = useQuery({
    queryKey: glp1TitrationQueryKey(medicationId),
    queryFn: () => listTitration(medicationId),
    enabled: !!medicationId,
  });
  useRefetchOnFocus(query.refetch, !!medicationId);
  return query;
}

export function useSerumCurve(medicationId: string) {
  return useQuery({
    queryKey: glp1SerumCurveQueryKey(medicationId),
    queryFn: () => getSerumCurve(medicationId),
    enabled: !!medicationId,
  });
}

export function useSiteSuggestion(medicationId: string) {
  return useQuery({
    queryKey: glp1SiteSuggestionQueryKey(medicationId),
    queryFn: () => getSiteSuggestion(medicationId),
    enabled: !!medicationId,
  });
}

export function useLogInjection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LogInjectionInput) => logInjection(body),
    onSuccess: () => invalidateMedicationEntryCaches(queryClient),
  });
}

export function useDeleteInjection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteInjection(id),
    // Deleting credits the dose back to its pen, so the pens refresh as well;
    // they sit under the medications root with everything else.
    onSuccess: () => invalidateMedicationEntryCaches(queryClient),
  });
}

export function useCreatePen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      medicationId,
      body,
    }: {
      medicationId: string;
      body: Parameters<typeof createPen>[1];
    }) => createPen(medicationId, body),
    onSuccess: () => invalidateMedicationEntryCaches(queryClient),
  });
}

export function useUpdatePen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: Partial<Omit<MedicationPen, 'id' | 'medication_id'>>;
    }) => updatePen(id, body),
    onSuccess: () => invalidateMedicationEntryCaches(queryClient),
  });
}

export function useDeletePen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePen(id),
    onSuccess: () => invalidateMedicationEntryCaches(queryClient),
  });
}

export function useCreateTitrationStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      medicationId,
      body,
    }: {
      medicationId: string;
      body: UpdateTitrationStepInput & { dose_mg: number };
    }) => createTitrationStep(medicationId, body),
    onSuccess: () => invalidateMedicationEntryCaches(queryClient),
  });
}

export function useUpdateTitrationStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpdateTitrationStepInput;
    }) => updateTitrationStep(id, body),
    onSuccess: () => invalidateMedicationEntryCaches(queryClient),
  });
}

export function useDeleteTitrationStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (step: Pick<TitrationStep, 'id'>) =>
      deleteTitrationStep(step.id),
    onSuccess: () => invalidateMedicationEntryCaches(queryClient),
  });
}

/**
 * GLP-1 daily check-in. The four metrics are stored as `GLP *` daily custom
 * measurement categories (the same ones web writes), so they also show in
 * Check-in and Reports. A category is created on first save when missing.
 */
export function useGlp1CheckIn(date: string) {
  const queryClient = useQueryClient();
  const categoriesQuery = useCustomCategories();
  const entriesQuery = useCustomMeasurementsByDate(date);

  const loadedValues = useMemo(() => {
    const values = {} as Record<Glp1CheckInMetricKey, number>;
    for (const metric of GLP1_CHECKIN_METRICS) {
      const category = categoriesQuery.data?.find(
        (c) => c.name === metric.categoryName
      );
      const entry = category
        ? entriesQuery.data?.find(
            (e) => String(e.category_id) === String(category.id)
          )
        : undefined;
      const parsed = entry ? Number(entry.value) : NaN;
      values[metric.key] = Number.isFinite(parsed)
        ? parsed
        : GLP1_CHECKIN_DEFAULT;
    }
    return values;
  }, [categoriesQuery.data, entriesQuery.data]);

  const hasSavedValues = useMemo(
    () =>
      GLP1_CHECKIN_METRICS.some((metric) => {
        const category = categoriesQuery.data?.find(
          (c) => c.name === metric.categoryName
        );
        return (
          !!category &&
          !!entriesQuery.data?.some(
            (e) => String(e.category_id) === String(category.id)
          )
        );
      }),
    [categoriesQuery.data, entriesQuery.data]
  );

  // IDs created by a save that then failed. The categories query still has the
  // pre-save list until it refetches, and the server does not dedupe by name,
  // so a retry must reuse these instead of creating them again.
  const createdCategoryIds = useRef(new Map<string, string>());

  const save = useMutation({
    mutationFn: async (values: Record<Glp1CheckInMetricKey, number>) => {
      // Sequential on purpose: two parallel first saves could each create the
      // same category, and the server does not dedupe by name.
      const known = queryClient.getQueryData<CustomCategory[]>(
        customCategoriesQueryKey
      );
      for (const metric of GLP1_CHECKIN_METRICS) {
        let categoryId =
          createdCategoryIds.current.get(metric.categoryName) ??
          known?.find((c) => c.name === metric.categoryName)?.id;
        if (!categoryId) {
          const created = await createCustomCategory({
            name: metric.categoryName,
            display_name: metric.defaultLabel,
            measurement_type: 'score (0–10)',
            frequency: 'Daily',
            data_type: 'numeric',
          });
          categoryId = created.id;
          createdCategoryIds.current.set(
            metric.categoryName,
            String(categoryId)
          );
        }
        await saveCustomMeasurement({
          category_id: String(categoryId),
          value: String(values[metric.key]),
          entry_date: date,
          entry_hour: null,
          entry_timestamp: new Date().toISOString(),
          notes: '',
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: customMeasurementsByDateQueryKey(date),
      });
      void queryClient.invalidateQueries({
        queryKey: latestManualCustomEntriesRootQueryKey,
      });
      refreshHealthSyncCache(queryClient);
    },
    // A failure partway through has already created categories. Invalidate
    // here, not only on success, so the next save sees them once the refetch
    // lands. The ref above covers the gap before that refetch returns.
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: customCategoriesQueryKey,
      });
    },
  });

  return {
    loadedValues,
    hasSavedValues,
    isLoading: categoriesQuery.isLoading || entriesQuery.isLoading,
    save,
  };
}
