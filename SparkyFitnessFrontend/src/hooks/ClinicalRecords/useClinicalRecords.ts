import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { checkInKeys } from '@/api/keys/checkin';
import { invalidateLabs } from '@/hooks/Labs/useLabResults';
import {
  previewClinicalRecords,
  executeClinicalImport,
  type ClinicalImportPreviewResponse,
  type ClinicalImportExecuteRequest,
  type ClinicalImportExecuteResponse,
  type ParsedVital,
  type ParsedLab,
} from '@/api/ClinicalRecords/clinicalRecordsApi';

export type {
  ClinicalImportPreviewResponse,
  ClinicalImportExecuteRequest,
  ClinicalImportExecuteResponse,
  ParsedVital,
  ParsedLab,
};

export const invalidateClinicalRecords = (queryClient: QueryClient) => {
  invalidateLabs(queryClient);
  queryClient.invalidateQueries({ queryKey: checkInKeys.all });
};

export const usePreviewClinicalRecords = () =>
  useMutation({
    mutationFn: (file: File) => previewClinicalRecords(file),
  });

export const useExecuteClinicalImport = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ClinicalImportExecuteRequest) =>
      executeClinicalImport(payload),
    onSuccess: (result) => {
      if (result.vitalsImported > 0 || result.labsImported > 0) {
        invalidateClinicalRecords(queryClient);
      }
    },
  });
};
