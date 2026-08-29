import { z } from 'zod';

export const AnalyzeFoodImageSchema = z
  .object({
    image_url: z
      .string()
      .optional()
      .describe(
        'Optional. The image is automatically read from the attached user message, so this can be omitted.'
      ),
    description: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Optional but IMPORTANT. What the user says the food actually is, in their own words — the dish name, cuisine, preparation, or ingredients they named. The vision model treats this as AUTHORITATIVE over what it sees. ALWAYS pass this when the user corrects a previous analysis ("no, it is ghee roast dosa, not appam") or names the dish anywhere in the conversation; the vision model cannot see the chat, so a correction you do not pass here is lost and the same wrong answer comes back.'
      ),
    total_weight: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Optional. The total weight of the plate when the user states one, with its unit, e.g. "400 g" or "14 oz". The vision model distributes it across the items proportionally instead of guessing the portion size.'
      ),
    meal_type: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Optional. The meal slot the user named for this food: breakfast | lunch | dinner | snacks, or a custom meal type name. The card matches it against the user's own meal types."
      ),
    entry_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Optional. Calendar day (YYYY-MM-DD) the user asked this to be logged for (e.g. "yesterday", "last Monday"). Omit for today; the meal card defaults to the user\'s current day.'
      ),
  })
  .strict();

export const ScanLabelSchema = z
  .object({
    image_url: z
      .string()
      .optional()
      .describe(
        'Optional. The image is automatically read from the attached user message, so this can be omitted.'
      ),
  })
  .strict();

export type AnalyzeFoodImageInput = z.infer<typeof AnalyzeFoodImageSchema>;
export type ScanLabelInput = z.infer<typeof ScanLabelSchema>;
