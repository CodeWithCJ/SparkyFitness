import { z } from 'zod';

export const AnalyzeFoodImageSchema = z
  .object({
    image_url: z
      .string()
      .optional()
      .describe(
        'Optional. The image is automatically read from the attached user message, so this can be omitted.'
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
