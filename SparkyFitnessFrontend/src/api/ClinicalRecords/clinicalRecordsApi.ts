import { apiCall } from '@/api/api';

export interface ParsedVital {
  kind: string;
  sparkyType: string;
  value: number;
  unit: string;
  rawDate: string;
  isoDate: string;
  recordedAt: string;
}

export interface ParsedLab {
  markerName: string;
  loinc?: string;
  entryDate: string;
  recordedAt: string;
  valueNumeric?: number;
  valueText?: string;
  unit?: string;
  refRangeLow?: number;
  refRangeHigh?: number;
}

export interface ClinicalImportPreviewResponse {
  vitalsCount: number;
  labsCount: number;
  sourceDocuments: string[];
  vitals: ParsedVital[];
  labs: ParsedLab[];
}

export interface ClinicalImportExecuteRequest {
  vitals?: ParsedVital[];
  labs?: ParsedLab[];
  sourceLabel?: string;
  clientRequestId?: string;
}

export interface ClinicalImportExecuteResponse {
  vitalsImported: number;
  vitalsSkipped: number;
  labsImported: number;
  labReportId?: string;
  errors: string[];
}

export async function previewClinicalRecords(
  file: File
): Promise<ClinicalImportPreviewResponse> {
  const formData = new FormData();
  formData.append('file', file);
  return apiCall<ClinicalImportPreviewResponse>(
    '/v2/clinical-records/preview',
    {
      method: 'POST',
      body: formData,
      isFormData: true,
    }
  );
}

export async function executeClinicalImport(
  payload: ClinicalImportExecuteRequest
): Promise<ClinicalImportExecuteResponse> {
  return apiCall<ClinicalImportExecuteResponse>('/v2/clinical-records/import', {
    method: 'POST',
    body: payload,
  });
}
