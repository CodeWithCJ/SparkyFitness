import { z } from "zod";

export const passkeyRegistrationTicketsIdSchema = z.string().or(z.number());

export const passkeyRegistrationTicketsSchema = z.object({
  id: z.string().optional(),
  ticket_hash: z.string(),
  user_id: z.string(),
  session_token: z.string(),
  expires_at: z.date(),
  used_at: z.date().nullable().optional(),
  created_at: z.date().optional(),
});

export const passkeyRegistrationTicketsInitializerSchema = z.object({
  id: z.string().optional(),
  ticket_hash: z.string().optional(),
  user_id: z.string().optional(),
  session_token: z.string().optional(),
  expires_at: z.date().optional(),
  used_at: z.date().nullable().optional(),
  created_at: z.date().optional(),
});

export const passkeyRegistrationTicketsMutatorSchema =
  passkeyRegistrationTicketsInitializerSchema.partial();

export type PasskeyRegistrationTickets = z.infer<
  typeof passkeyRegistrationTicketsSchema
>;
export type PasskeyRegistrationTicketsInitializer = z.infer<
  typeof passkeyRegistrationTicketsInitializerSchema
>;
export type PasskeyRegistrationTicketsMutator = z.infer<
  typeof passkeyRegistrationTicketsMutatorSchema
>;
