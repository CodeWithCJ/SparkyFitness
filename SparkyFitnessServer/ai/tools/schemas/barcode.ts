import { z } from 'zod';

export const BARCODE_ACTIONS = ['lookup_barcode'] as const;

export const barcodeSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('lookup_barcode'),
      barcode: z
        .string()
        .trim()
        .regex(/^\d{8,14}$/, 'Barcode must be 8-14 digits')
        .describe('The product barcode (UPC/EAN), 8-14 digits.'),
      provider_id: z
        .string()
        .optional()
        .describe(
          'Optional external provider ID to look up against a specific configured provider.'
        ),
    })
    .strict(),
]);

export type BarcodeInput = z.infer<typeof barcodeSchema>;

export const barcodeInput = z.object({
  action: z.enum(BARCODE_ACTIONS).optional(),
  barcode: z.string().optional(),
  provider_id: z.string().optional(),
});
