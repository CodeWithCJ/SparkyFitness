import { z } from 'zod/v4';
import { isDayString } from '@workspace/shared';

const optionalNullableString = z.string().nullable().optional();
const dayString = z
  .string()
  .refine((v) => isDayString(v), { message: 'Expected YYYY-MM-DD' });

export const CreatePregnancyBodySchema = z
  .object({
    due_date: dayString.optional(),
    due_date_basis: z.enum(['lmp', 'conception', 'manual', 'scan']).optional(),
    lmp_date: dayString.nullable().optional(),
    conception_date: dayString.nullable().optional(),
    fetus_count: z.number().int().min(1).max(4).optional(),
    prenatal_medication_id: z.string().uuid().nullable().optional(),
    supplement_medication_id: z.string().uuid().nullable().optional(),
    notes: optionalNullableString,
  })
  .loose();

export type CreatePregnancyBody = z.infer<typeof CreatePregnancyBodySchema>;

export const UpdatePregnancyBodySchema = z
  .object({
    due_date: dayString.optional(),
    due_date_basis: z.enum(['lmp', 'conception', 'manual', 'scan']).optional(),
    lmp_date: dayString.nullable().optional(),
    conception_date: dayString.nullable().optional(),
    fetus_count: z.number().int().min(1).max(4).optional(),
    status: z.enum(['active', 'completed', 'ended']).optional(),
    ended_on: dayString.nullable().optional(),
    outcome: optionalNullableString,
    prenatal_medication_id: z.string().uuid().nullable().optional(),
    supplement_medication_id: z.string().uuid().nullable().optional(),
    notes: optionalNullableString,
  })
  .loose();

export type UpdatePregnancyBody = z.infer<typeof UpdatePregnancyBodySchema>;

// --- Kicks ------------------------------------------------------------------

export const StartKickSessionBodySchema = z
  .object({
    pregnancy_id: z.string().uuid(),
  })
  .loose();

export const UpdateKickSessionBodySchema = z
  .object({
    kick_count: z.number().int().min(0).max(1000).optional(),
    kick_times: z.array(z.string()).optional(),
    ended: z.boolean().optional(),
  })
  .loose();

export type UpdateKickSessionBody = z.infer<typeof UpdateKickSessionBodySchema>;

// --- Contractions -----------------------------------------------------------

export const CreateContractionBodySchema = z
  .object({
    pregnancy_id: z.string().uuid(),
    started_at: z.string().optional(),
    ended_at: z.string().nullable().optional(),
    intensity: z.number().int().min(1).max(5).nullable().optional(),
  })
  .loose();

export const UpdateContractionBodySchema = z
  .object({
    ended_at: z.string().nullable().optional(),
    intensity: z.number().int().min(1).max(5).nullable().optional(),
  })
  .loose();

// --- Checklist --------------------------------------------------------------

export const UpsertChecklistItemBodySchema = z
  .object({
    template_key: optionalNullableString,
    custom_title: optionalNullableString,
    week: z.number().int().min(0).max(45).optional(),
    completed: z.boolean().optional(),
    dismissed: z.boolean().optional(),
  })
  .loose();

export type UpsertChecklistItemBody = z.infer<
  typeof UpsertChecklistItemBodySchema
>;

// --- Appointments -----------------------------------------------------------

export const CreateAppointmentBodySchema = z
  .object({
    pregnancy_id: z.string().uuid().nullable().optional(),
    scheduled_at: z.string(),
    appointment_type: z.string().max(50).optional(),
    title: optionalNullableString,
    location: optionalNullableString,
    notes: optionalNullableString,
    outcome: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();

export const UpdateAppointmentBodySchema = z
  .object({
    scheduled_at: z.string().optional(),
    appointment_type: z.string().max(50).optional(),
    title: optionalNullableString,
    location: optionalNullableString,
    notes: optionalNullableString,
    outcome: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();

export const PregnancyOverviewQuerySchema = z
  .object({
    date: dayString.optional(),
  })
  .loose();
