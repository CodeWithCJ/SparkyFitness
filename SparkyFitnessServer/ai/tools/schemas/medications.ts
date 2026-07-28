import { z } from 'zod';
import { optionalDateSchema, uuidSchema } from './common.js';

const listMedicationsSchema = z
  .object({
    action: z.literal('list_medications'),
    glp1_only: z
      .boolean()
      .optional()
      .describe('Filter to GLP-1 medications only'),
    active_only: z
      .boolean()
      .optional()
      .describe('Filter to active medications only'),
  })
  .strict();

const getMedicationSchema = z
  .object({
    action: z.literal('get_medication'),
    medication_id: uuidSchema.describe('UUID of the medication'),
  })
  .strict();

const logDoseSchema = z
  .object({
    action: z.literal('log'),
    medication_id: uuidSchema
      .optional()
      .describe('UUID of the medication (or use medication_name)'),
    medication_name: z
      .string()
      .optional()
      .describe('Name of the medication (alternative to medication_id)'),
    status: z
      .enum(['taken', 'skipped', 'snoozed', 'prn_taken'])
      .optional()
      .describe('Dose status (defaults to taken)'),
    taken_at: z
      .string()
      .optional()
      .describe('ISO timestamp when the dose was taken'),
    entry_date: optionalDateSchema,
    dose_amount_snapshot: z
      .number()
      .optional()
      .describe('Dose amount (e.g. 10 for 10 mg)'),
    dose_unit_snapshot: z
      .string()
      .optional()
      .describe('Dose unit (e.g. mg, mL)'),
    notes: z.string().optional().describe('Optional notes about the dose'),
  })
  .strict();

const listEntriesSchema = z
  .object({
    action: z.literal('list_entries'),
    medication_id: uuidSchema
      .optional()
      .describe('Filter to a specific medication'),
    from_date: optionalDateSchema,
    to_date: optionalDateSchema,
  })
  .strict();

const updateEntrySchema = z
  .object({
    action: z.literal('update_entry'),
    entry_id: uuidSchema.describe('UUID of the entry to update'),
    status: z
      .enum(['taken', 'skipped', 'snoozed', 'prn_taken'])
      .optional()
      .describe('New dose status'),
    taken_at: z
      .string()
      .optional()
      .describe('New ISO timestamp when the dose was taken'),
    entry_date: optionalDateSchema,
    notes: z
      .string()
      .nullable()
      .optional()
      .describe('New notes (pass null to clear)'),
  })
  .strict();

const deleteEntrySchema = z
  .object({
    action: z.literal('delete_entry'),
    entry_id: uuidSchema.describe('UUID of the entry to delete'),
  })
  .strict();

const logInjectionSchema = z
  .object({
    action: z.literal('log_injection'),
    medication_id: uuidSchema
      .optional()
      .describe('UUID of the GLP-1 medication (or use medication_name)'),
    medication_name: z
      .string()
      .optional()
      .describe('Name of the medication (alternative to medication_id)'),
    dose_mg: z
      .number()
      .optional()
      .describe(
        'Dose in mg (defaults from active titration step or medication dose)'
      ),
    site: z
      .string()
      .optional()
      .describe('Injection site (abdomen, thigh, arm, etc.)'),
    deduct_pen: z
      .boolean()
      .optional()
      .describe(
        'Whether to deduct from pen inventory (auto-picks best pen if true)'
      ),
    entry_date: optionalDateSchema,
    notes: z.string().optional().describe('Optional notes'),
  })
  .strict();

const listInjectionsSchema = z
  .object({
    action: z.literal('list_injections'),
    medication_id: uuidSchema
      .optional()
      .describe('Filter to a specific medication'),
    from_date: optionalDateSchema,
    to_date: optionalDateSchema,
  })
  .strict();

export const manageMedicationsSchema = z
  .discriminatedUnion('action', [
    listMedicationsSchema,
    getMedicationSchema,
    logDoseSchema,
    listEntriesSchema,
    updateEntrySchema,
    deleteEntrySchema,
    logInjectionSchema,
    listInjectionsSchema,
  ])
  .refine(
    (data) => {
      if (data.action === 'log' || data.action === 'log_injection') {
        return !!(data.medication_id || data.medication_name);
      }
      return true;
    },
    { message: 'Either medication_id or medication_name is required' }
  );

export type ManageMedicationsInput = z.infer<typeof manageMedicationsSchema>;

export const manageMedicationsInput = z.object({
  action: z
    .enum([
      'list_medications',
      'get_medication',
      'log',
      'list_entries',
      'update_entry',
      'delete_entry',
      'log_injection',
      'list_injections',
    ])
    .optional()
    .describe('Action to perform'),
  medication_id: uuidSchema.optional().describe('UUID of the medication'),
  medication_name: z
    .string()
    .optional()
    .describe(
      'Name of the medication (alternative to medication_id for log / log_injection)'
    ),
  entry_id: uuidSchema
    .optional()
    .describe('UUID of the entry (for update_entry / delete_entry)'),
  status: z
    .enum(['taken', 'skipped', 'snoozed', 'prn_taken'])
    .optional()
    .describe('Dose status'),
  taken_at: z
    .string()
    .optional()
    .describe('ISO timestamp when the dose was taken'),
  entry_date: optionalDateSchema.describe(
    'Calendar date for the dose (YYYY-MM-DD, defaults to today)'
  ),
  notes: z.string().nullable().optional().describe('Notes about the entry'),
  glp1_only: z
    .boolean()
    .optional()
    .describe('Filter to GLP-1 medications only'),
  active_only: z
    .boolean()
    .optional()
    .describe('Filter to active medications only'),
  from_date: optionalDateSchema,
  to_date: optionalDateSchema,
  dose_mg: z.number().optional().describe('Dose in mg (for log_injection)'),
  dosage: z
    .number()
    .optional()
    .describe('Dosage amount (alternative to dose_amount_snapshot, e.g. 10)'),
  dosage_unit: z
    .string()
    .optional()
    .describe('Dosage unit (alternative to dose_unit_snapshot, e.g. mg)'),
  dose_amount_snapshot: z
    .number()
    .optional()
    .describe('Dosage amount (alternative to dosage, e.g. 10)'),
  dose_unit_snapshot: z
    .string()
    .optional()
    .describe('Dosage unit (alternative to dosage_unit, e.g. mg)'),
  site: z.string().optional().describe('Injection site'),
  deduct_pen: z
    .boolean()
    .optional()
    .describe('Whether to deduct from pen inventory'),
});
