import { z } from 'zod';

export const COOKTOOL_COUNTRIES = [
  'US',
  'GB',
  'DE',
  'FR',
  'SE',
  'NO',
  'DK',
] as const;

export type CookToolCountry = (typeof COOKTOOL_COUNTRIES)[number];

export const cooktoolOptionsSchema = z.object({
  country: z.enum(COOKTOOL_COUNTRIES).default('US'),
});

export type CookToolOptions = z.infer<typeof cooktoolOptionsSchema>;
