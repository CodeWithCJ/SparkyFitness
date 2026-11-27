import { useMutation, type QueryClient } from '@tanstack/react-query';
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

export const useExecuteClinicalImport = () =>
  useMutation({
    mutationFn: (payload: ClinicalImportExecuteRequest) =>
      executeClinicalImport(payload),
  });
