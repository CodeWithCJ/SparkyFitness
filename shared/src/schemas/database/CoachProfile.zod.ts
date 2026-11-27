import { z } from 'zod';

export const coachProfileSchema = z.object({
  user_id: z.string(),
  diet_type: z.string().nullable(),
  foods_avoid: z.string().nullable(),
  foods_prefer: z.string().nullable(),
  tone: z.string().nullable(),
  notes: z.string().nullable(),
  checkin_times: z.array(z.string()),
  max_messages_per_day: z.number(),
  paused_until: z.coerce.date().nullable(),
  pause_reason: z.string().nullable(),
  last_checkin_at: z.coerce.date().nullable(),
  last_event_scan_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const coachProfileInitializerSchema = z.object({
  user_id: z.string(),
  diet_type: z.string().optional().nullable(),
  foods_avoid: z.string().optional().nullable(),
  foods_prefer: z.string().optional().nullable(),
  tone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  checkin_times: z.array(z.string()).optional(),
  max_messages_per_day: z.number().optional(),
  paused_until: z.coerce.date().optional().nullable(),
  pause_reason: z.string().optional().nullable(),
  last_checkin_at: z.coerce.date().optional().nullable(),
  last_event_scan_at: z.coerce.date().optional().nullable(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export const coachProfileMutatorSchema =
  coachProfileInitializerSchema.partial();
