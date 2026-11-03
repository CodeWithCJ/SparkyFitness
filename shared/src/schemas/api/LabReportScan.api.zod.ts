import { z } from 'zod';

/**
 * What an AI reads off a lab report. One entry per numeric result line; lines
 * without a number (such as "Negative") are left out. `ref_low`/`ref_high` are
 * the reference interval the lab printed beside the result, which already
 * accounts for the lab, age and sex.
 */
export const labReportResultSchema = z.object({
  name: z.string().trim().min(1).max(200),
  value: z.number().nonnegative(),
  unit: z.string().trim().max(40).nullable(),
  ref_low: z.number().nonnegative().nullable(),
  ref_high: z.number().nonnegative().nullable(),
});

export const labReportExtractionSchema = z.object({
  lab_name: z.string().trim().max(200).nullable(),
  /** The date the sample was collected, `YYYY-MM-DD`. */
  collected_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  results: z.array(labReportResultSchema).max(200),
});

/** POST /api/v2/lab-reports/scan */
export const labReportScanRequestSchema = z.object({
  /**
   * Base64 of the PDF or image. The server's own limits are tighter (a PDF up
   * to 20M characters, a photo up to 8M); this keeps an absurd body out early.
   */
  document: z.string().min(1).max(20_000_000),
  mime_type: z.string().min(1),
});

/** A scanned result, with the preset the server matched it to (if any). */
export const labReportScanResultSchema = labReportResultSchema.extend({
  /** `LAB_MARKER_PRESETS` key when the name matched a known marker. */
  marker_key: z.string().nullable(),
});

export const labReportScanResponseSchema = z.object({
  report: z.object({
    lab_name: z.string().nullable(),
    collected_on: z.string().nullable(),
    results: z.array(labReportScanResultSchema),
  }),
});

export type LabReportResult = z.infer<typeof labReportResultSchema>;
export type LabReportExtraction = z.infer<typeof labReportExtractionSchema>;
export type LabReportScanRequest = z.infer<typeof labReportScanRequestSchema>;
export type LabReportScanResult = z.infer<typeof labReportScanResultSchema>;
export type LabReportScanResponse = z.infer<typeof labReportScanResponseSchema>;
