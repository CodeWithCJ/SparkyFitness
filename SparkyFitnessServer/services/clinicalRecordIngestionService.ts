import crypto from 'node:crypto';
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
        vitalsImported = (result.processed || []).length;
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
    // Only ingest labs with a finite numeric value to avoid fabricating 0 for qualitative/missing values
    const numericLabs = data.labs.filter(
      (l) =>
        typeof l.valueNumeric === 'number' && Number.isFinite(l.valueNumeric)
    );

    if (numericLabs.length > 0) {
      // Generate or use clientRequestId for idempotency
      const baseRequestId =
        data.clientRequestId || `clinical_${crypto.randomUUID()}`;

      // Group labs by entryDate to preserve each lab's historical date
      const labsByDate = new Map<string, ParsedLab[]>();
      for (const lab of numericLabs) {
        const dateKey =
          lab.entryDate ||
          (lab.recordedAt
            ? lab.recordedAt.slice(0, 10)
            : new Date().toISOString().slice(0, 10));
        const group = labsByDate.get(dateKey) || [];
        group.push(lab);
        labsByDate.set(dateKey, group);
      }

      for (const [entryDate, group] of labsByDate.entries()) {
        const reportPayload = {
          client_request_id: `${baseRequestId}_${entryDate}`,
          lab_name: 'Epic MyChart / Clinical Import',
          entry_date: entryDate,
          results: group.map((l) => ({
            marker_name: l.markerName,
            value_numeric: l.valueNumeric!,
            unit: l.unit ?? '',
            ref_range_low: l.refRangeLow ?? null,
            ref_range_high: l.refRangeHigh ?? null,
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
            labsImported += (reportRes.results || []).length;
          }
        } catch (err) {
          errors.push(
            `Failed to import lab report for ${entryDate}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
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
