import { z } from 'zod';

/** Most tags one person can keep. */
export const ACTION_TAGS_MAX = 100;

/** The sticker link is `https://tag.sparkyfitness.com/t/<tag_code>`. */
export const ACTION_TAG_HOST = 'tag.sparkyfitness.com';
export const ACTION_TAG_PATH_PREFIX = '/t/';

/** A scan within this many seconds of the last run of the same tag is a double read. */
export const ACTION_TAG_DEBOUNCE_SECONDS = 10;

/** 128 random bits as lowercase hex. */
export const tagCodeSchema = z.string().regex(/^[a-f0-9]{32}$/);

/**
 * What a tap does. Add a member here and a runner in the server's
 * actionTagService, which fails to compile until every type has one.
 */
export const tagActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('water'),
    container_id: z.number().int().positive(),
    drinks: z.number().int().min(1).max(20),
  }),
]);
export type TagAction = z.infer<typeof tagActionSchema>;
export type TagActionType = TagAction['type'];

export const actionTagResponseSchema = z.object({
  id: z.string(),
  tag_code: z.string(),
  label: z.string(),
  action: tagActionSchema,
  ask_before_running: z.boolean(),
  last_run_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ActionTagResponse = z.infer<typeof actionTagResponseSchema>;

export const actionTagListResponseSchema = z.array(actionTagResponseSchema);
export type ActionTagListResponse = z.infer<typeof actionTagListResponseSchema>;

export const createActionTagBodySchema = z.object({
  tag_code: tagCodeSchema,
  label: z.string().trim().min(1).max(120),
  action: tagActionSchema,
  ask_before_running: z.boolean().optional(),
});
export type CreateActionTagBody = z.infer<typeof createActionTagBodySchema>;

export const updateActionTagBodySchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  action: tagActionSchema.optional(),
  ask_before_running: z.boolean().optional(),
});
export type UpdateActionTagBody = z.infer<typeof updateActionTagBodySchema>;

export const scanActionTagBodySchema = z.object({
  tag_code: tagCodeSchema,
  /** The device's calendar day, as for other quick logging. */
  entry_date: z.iso.date(),
  /** Sent after the person agreed to a `needs_confirmation` answer. */
  confirmed: z.boolean().optional(),
});
export type ScanActionTagBody = z.infer<typeof scanActionTagBodySchema>;

export const scanActionTagStatusSchema = z.enum([
  'done',
  'needs_confirmation',
  'unknown_tag',
  'target_missing',
  'too_soon',
]);
export type ScanActionTagStatus = z.infer<typeof scanActionTagStatusSchema>;

export const scanActionTagResponseSchema = z.object({
  status: scanActionTagStatusSchema,
  tag: actionTagResponseSchema.nullable(),
  /** What was logged, e.g. "1 x Stanley (1 L)". Set when status is `done`. */
  summary: z.string().nullable(),
});
export type ScanActionTagResponse = z.infer<typeof scanActionTagResponseSchema>;
