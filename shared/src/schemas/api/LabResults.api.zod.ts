import { z } from 'zod';
import { LAB_MARKER_PRESETS } from '../../constants/labMarkers.ts';

const BUILT_IN_MARKER_KEYS = new Set(LAB_MARKER_PRESETS.map((p) => p.key));

export const labResultSourceSchema = z.enum(['manual', 'report', 'fhir']);
export type LabResultSource = z.infer<typeof labResultSourceSchema>;

/** A real calendar day: `2026-02-31` has the right shape but is not a date. */
const isCalendarDay = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .refine(isCalendarDay, 'must be a real calendar date');
const unitSchema = z.string().trim().max(40);
const rangeBoundSchema = z.number().finite().nullable().optional();

type RangeFields = {
  ref_range_low?: number | null;
  ref_range_high?: number | null;
};

const refRangeOrdered = (body: RangeFields): boolean =>
  body.ref_range_low == null ||
  body.ref_range_high == null ||
  body.ref_range_low <= body.ref_range_high;

const refRangeOrderedIssue = {
  message: 'ref_range_low must not exceed ref_range_high',
  path: ['ref_range_low'],
};

export const createLabMarkerBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    unit: unitSchema.default(''),
    ref_range_low: rangeBoundSchema,
    ref_range_high: rangeBoundSchema,
  })
  .refine(refRangeOrdered, refRangeOrderedIssue);
export type CreateLabMarkerBody = z.infer<typeof createLabMarkerBodySchema>;

export const updateLabMarkerBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    unit: unitSchema.optional(),
    ref_range_low: rangeBoundSchema,
    ref_range_high: rangeBoundSchema,
  })
  .refine(refRangeOrdered, refRangeOrderedIssue);
export type UpdateLabMarkerBody = z.infer<typeof updateLabMarkerBodySchema>;

export const labMarkerResponseSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  unit: z.string(),
  ref_range_low: z.number().nullable(),
  ref_range_high: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type LabMarkerResponse = z.infer<typeof labMarkerResponseSchema>;

export const createLabResultBodySchema = z
  .object({
    marker_key: z
      .string()
      .refine((key) => BUILT_IN_MARKER_KEYS.has(key), 'unknown marker_key')
      .nullable()
      .optional(),
    custom_marker_id: z.string().uuid().nullable().optional(),
    entry_date: dateStringSchema,
    value_numeric: z.number().finite().nullable().optional(),
    value_text: z.string().trim().min(1).max(200).nullable().optional(),
    unit: unitSchema.default(''),
    ref_range_low: rangeBoundSchema,
    ref_range_high: rangeBoundSchema,
    lab_name: z.string().trim().max(200).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    source: labResultSourceSchema.default('manual'),
  })
  .refine(
    (body) => (body.marker_key != null) !== (body.custom_marker_id != null),
    {
      message: 'Provide exactly one of marker_key or custom_marker_id',
      path: ['marker_key'],
    }
  )
  .refine((body) => body.value_numeric != null || body.value_text != null, {
    message: 'Provide value_numeric or value_text',
    path: ['value_numeric'],
  })
  .refine(refRangeOrdered, refRangeOrderedIssue);
export type CreateLabResultBody = z.infer<typeof createLabResultBodySchema>;

/** The marker of a saved result cannot change; only its values can. */
export const updateLabResultBodySchema = z
  .object({
    entry_date: dateStringSchema.optional(),
    value_numeric: z.number().finite().nullable().optional(),
    value_text: z.string().trim().min(1).max(200).nullable().optional(),
    unit: unitSchema.optional(),
    ref_range_low: rangeBoundSchema,
    ref_range_high: rangeBoundSchema,
    lab_name: z.string().trim().max(200).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine(refRangeOrdered, refRangeOrderedIssue);
export type UpdateLabResultBody = z.infer<typeof updateLabResultBodySchema>;

export const labResultResponseSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  marker_key: z.string().nullable(),
  custom_marker_id: z.string().nullable(),
  entry_date: z.string(),
  value_numeric: z.number().nullable(),
  value_text: z.string().nullable(),
  unit: z.string(),
  ref_range_low: z.number().nullable(),
  ref_range_high: z.number().nullable(),
  lab_name: z.string().nullable(),
  notes: z.string().nullable(),
  source: labResultSourceSchema,
  created_at: z.string(),
  updated_at: z.string(),
});
export type LabResultResponse = z.infer<typeof labResultResponseSchema>;

export const labResultListQuerySchema = z
  .object({
    markerKey: z.string().min(1).optional(),
    markerId: z.string().uuid().optional(),
    startDate: dateStringSchema.optional(),
    endDate: dateStringSchema.optional(),
    limit: z.coerce.number().int().min(1).max(5000).default(1000),
  })
  .refine((q) => !(q.markerKey && q.markerId), {
    message: 'Use markerKey or markerId, not both',
    path: ['markerKey'],
  });
export type LabResultListQuery = z.infer<typeof labResultListQuerySchema>;
