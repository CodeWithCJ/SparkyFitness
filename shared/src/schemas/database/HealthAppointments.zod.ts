import { z } from "zod";

export const healthAppointmentsIdSchema = z.string().or(z.number());

export const healthAppointmentsSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  pregnancy_id: z.string().nullable().optional(),
  scheduled_at: z.date(),
  appointment_type: z.string(),
  title: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  outcome: z.unknown(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const healthAppointmentsInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  pregnancy_id: z.string().nullable().optional(),
  scheduled_at: z.date().optional(),
  appointment_type: z.string().optional(),
  title: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  outcome: z.unknown().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const healthAppointmentsMutatorSchema =
  healthAppointmentsInitializerSchema.partial();

export type HealthAppointments = z.infer<typeof healthAppointmentsSchema>;
export type HealthAppointmentsInitializer = z.infer<
  typeof healthAppointmentsInitializerSchema
>;
export type HealthAppointmentsMutator = z.infer<
  typeof healthAppointmentsMutatorSchema
>;
