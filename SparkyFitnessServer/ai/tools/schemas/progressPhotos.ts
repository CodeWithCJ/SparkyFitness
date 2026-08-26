import { z } from 'zod';
import { uuidSchema, optionalDateSchema } from './common.js';

export const PROGRESS_PHOTO_ACTIONS = [
  'list_photo_dates',
  'list_photos',
  'delete_photo',
] as const;

export const manageProgressPhotosSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list_photo_dates') }).strict(),
  z
    .object({
      action: z.literal('list_photos'),
      date: optionalDateSchema.describe(
        'The calendar day (YYYY-MM-DD) whose progress photos to list. Defaults to today.'
      ),
    })
    .strict(),
  z
    .object({
      action: z.literal('delete_photo'),
      photo_id: uuidSchema.describe('UUID of the progress photo to delete'),
    })
    .strict(),
]);

export type ManageProgressPhotosInput = z.infer<
  typeof manageProgressPhotosSchema
>;

export const manageProgressPhotosInput = z.object({
  action: z.enum(PROGRESS_PHOTO_ACTIONS).optional(),
  date: z.string().optional(),
  photo_id: z.string().optional(),
});
