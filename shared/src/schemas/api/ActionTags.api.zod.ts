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

/** Longest tag name. A new tag is named after what it logs, cut to this. */
export const ACTION_TAG_LABEL_MAX = 120;

/** Largest amount a food or meal tag logs per tap, in its own unit. */
export const ACTION_TAG_MAX_QUANTITY = 10000;

/**
 * Which meal a food or meal tag logs into: the one for the time of the tap
 * (each meal type's default time, as for any other quick logging), or always
 * the same one. A fixed meal type that was deleted falls back to the time.
 */
export const tagMealChoiceSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('auto') }),
  z.object({ mode: z.literal('fixed'), meal_type_id: z.uuid() }),
]);
export type TagMealChoice = z.infer<typeof tagMealChoiceSchema>;

const tagQuantitySchema = z.number().positive().max(ACTION_TAG_MAX_QUANTITY);
const tagUnitSchema = z.string().trim().min(1).max(50);

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
  z.object({
    type: z.literal('food'),
    // UUID columns: anything else would reach Postgres and fail with a 500.
    food_id: z.uuid(),
    variant_id: z.uuid(),
    /** In the variant's own serving unit, as a diary food entry stores it. */
    quantity: tagQuantitySchema,
    /**
     * The variant's serving unit, kept so a list can show the amount without
     * loading the food. A tap logs in the variant's own unit.
     */
    unit: tagUnitSchema,
    meal: tagMealChoiceSchema,
  }),
  z.object({
    type: z.literal('meal'),
    /** A saved meal from the Meals library. */
    meal_template_id: z.uuid(),
    quantity: tagQuantitySchema,
    /**
     * The meal's own serving unit (`serving`, or e.g. `g` for a meal measured
     * by weight), as a logged meal stores it. A tag whose unit no longer
     * matches the meal reads as pointing at something that was deleted.
     */
    unit: tagUnitSchema,
    meal: tagMealChoiceSchema,
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
  label: z.string().trim().min(1).max(ACTION_TAG_LABEL_MAX),
  action: tagActionSchema,
  ask_before_running: z.boolean().optional(),
});
export type CreateActionTagBody = z.infer<typeof createActionTagBodySchema>;

export const updateActionTagBodySchema = z.object({
  label: z.string().trim().min(1).max(ACTION_TAG_LABEL_MAX).optional(),
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
  /**
   * The diary row a food or meal tap created, so Undo removes exactly that
   * row. Absent for water, which undoes by drinks, and from older servers.
   */
  logged: z
    .object({
      kind: z.enum(['food_entry', 'food_entry_meal']),
      id: z.string(),
    })
    .nullable()
    .optional(),
});
export type ScanActionTagResponse = z.infer<typeof scanActionTagResponseSchema>;
