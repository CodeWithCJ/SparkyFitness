import { z } from 'zod';

export const AnalyzeFoodImageSchema = z
  .object({
    image_url: z
      .string()
      .optional()
      .describe(
        'Optional. The image is automatically read from the attached user message, so this can be omitted.'
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
