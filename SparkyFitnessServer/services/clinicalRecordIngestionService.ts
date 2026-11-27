import measurementService from './measurementService.js';
import * as labResultRepository from '../models/labResultRepository.js';
import {
  parseClinicalRecordBuffer,
  type ClinicalRecordPackage,
  type ParsedVital,
  type ParsedLab,
} from './clinicalRecordParserService.js';

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

/**
 * Previews the extracted contents of an uploaded C-CDA XML or Lucy .zip file.
 */
export function previewClinicalRecord(
  fileBuffer: Buffer,
  filename?: string
): ClinicalImportPreviewResponse {
  const parsed: ClinicalRecordPackage = parseClinicalRecordBuffer(
    fileBuffer,
    filename
  );
  return {
    vitalsCount: parsed.vitals.length,
    labsCount: parsed.labs.length,
    sourceDocuments: parsed.sourceDocuments,
    vitals: parsed.vitals,
    labs: parsed.labs,
  };
}

/**
 * Ingests reviewed vitals and labs into SparkyFitness.
 */
export async function executeClinicalImport(
  userId: string,
  data: ClinicalImportExecuteRequest,
  authenticatedUserId?: string
): Promise<ClinicalImportExecuteResponse> {
  const actor = authenticatedUserId ?? userId;
  const sourceLabel = data.sourceLabel || 'clinical_import';
  const errors: string[] = [];

  let vitalsImported = 0;
  let vitalsSkipped = 0;
  let labsImported = 0;
  let labReportId: string | undefined;

  // 1. Ingest vitals through measurementService.processHealthData
  if (data.vitals && data.vitals.length > 0) {
    const healthDataArray = data.vitals.map((v) => ({
      type: v.sparkyType,
      value: v.value,
      unit: v.unit,
      date: v.isoDate,
      timestamp: v.recordedAt,
      source: sourceLabel,
    }));

    try {
      const result = await measurementService.processHealthData(
        healthDataArray,
        userId,
        actor
      );
      if (result) {
        vitalsImported = (result.processedResults || []).length;
        vitalsSkipped = (result.skipped || []).length;
        if (result.errors && result.errors.length > 0) {
          for (const err of result.errors) {
            errors.push(
              typeof err === 'string' ? err : err.error || JSON.stringify(err)
            );
          }
        }
      }
    } catch (err) {
      errors.push(
        `Failed to process vitals: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 2. Ingest labs through labResultRepository.importLabReport
  if (data.labs && data.labs.length > 0) {
    // Generate or use clientRequestId for idempotency
    const clientRequestId =
      data.clientRequestId ||
      `clinical_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Find the latest entryDate or use today
    const dates = data.labs
      .map((l) => l.entryDate)
      .filter(Boolean)
      .sort();
    const collectedOn =
      dates[dates.length - 1] || new Date().toISOString().slice(0, 10);

    const reportPayload = {
      client_request_id: clientRequestId,
      lab_name: 'Epic MyChart / Clinical Import',
      collected_on: collectedOn,
      results: data.labs.map((l) => ({
        marker_name: l.markerName,
        value_numeric: l.valueNumeric ?? null,
        value_text: l.valueText ?? null,
        unit: l.unit ?? null,
        ref_range_low: l.refRangeLow ?? null,
        ref_range_high: l.refRangeHigh ?? null,
        notes: l.loinc ? `LOINC: ${l.loinc}` : null,
      })),
    };

    try {
      const reportRes = await labResultRepository.importLabReport(
        userId,
        reportPayload,
        actor
      );
      if (reportRes && reportRes.report) {
        labReportId = reportRes.report.id;
        labsImported = (reportRes.results || []).length;
      }
    } catch (err) {
      errors.push(
        `Failed to import lab report: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return {
    vitalsImported,
    vitalsSkipped,
    labsImported,
    labReportId,
    errors,
  };
}
