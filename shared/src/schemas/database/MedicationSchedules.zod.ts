import { z } from "zod";

export const medicationSchedulesIdSchema = z.string().or(z.number());

export const medicationSchedulesSchema = z.object({
  id: z.string().optional(),
  medication_id: z.string(),
  user_id: z.string(),
  schedule_type_id: z.string(),
  time_of_day: z.string().nullable().optional(),
  dose_amount: z.number().nullable().optional(),
  days_of_week: z.array(z.number()).nullable().optional(),
  interval_days: z.number().nullable().optional(),
  day_of_month: z.number().nullable().optional(),
  cycle_on_days: z.number().nullable().optional(),
  cycle_off_days: z.number().nullable().optional(),
  with_meal: z.string().nullable().optional(),
  prn_reason: z.string().nullable().optional(),
  prn_max_per_day: z.number().nullable().optional(),
  start_date: z.date().nullable().optional(),
  end_date: z.date().nullable().optional(),
  active: z.boolean(),
  source: z.string(),
  custom_fields: z.unknown(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const medicationSchedulesInitializerSchema = z.object({
  id: z.string().optional(),
  medication_id: z.string().optional(),
  user_id: z.string().optional(),
  schedule_type_id: z.string().optional(),
  time_of_day: z.string().nullable().optional(),
  dose_amount: z.number().nullable().optional(),
  days_of_week: z.array(z.number()).nullable().optional(),
  interval_days: z.number().nullable().optional(),
  day_of_month: z.number().nullable().optional(),
  cycle_on_days: z.number().nullable().optional(),
  cycle_off_days: z.number().nullable().optional(),
  with_meal: z.string().nullable().optional(),
  prn_reason: z.string().nullable().optional(),
  prn_max_per_day: z.number().nullable().optional(),
  start_date: z.date().nullable().optional(),
  end_date: z.date().nullable().optional(),
  active: z.boolean().optional(),
  source: z.string().optional(),
  custom_fields: z.unknown().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const medicationSchedulesMutatorSchema =
  medicationSchedulesInitializerSchema.partial();

export type MedicationSchedules = z.infer<typeof medicationSchedulesSchema>;
export type MedicationSchedulesInitializer = z.infer<
  typeof medicationSchedulesInitializerSchema
>;
export type MedicationSchedulesMutator = z.infer<
  typeof medicationSchedulesMutatorSchema
>;
