import { tool } from 'ai';
import { todayInZone } from '@workspace/shared';
import { log } from '../../config/logging.js';
import checkInPhotoService from '../../services/checkInPhotoService.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatConfirmation, formatList } from './formatting.js';
import {
  manageProgressPhotosSchema,
  manageProgressPhotosInput,
  type ManageProgressPhotosInput,
} from './schemas/progressPhotos.js';
import { normalizeActionArgs } from './dates.js';

const VALID_ACTIONS = ['list_photo_dates', 'list_photos', 'delete_photo'];

// Shape returned by checkInPhotoService.getPhotosByDate. Only the rendered
// fields are declared; extra columns are ignored.
interface ProgressPhotoView {
  id: string;
  photo_type: string;
  entry_date: string;
  created_at: string;
}

function formatPhoto(row: ProgressPhotoView): string {
  return `**${row.photo_type}** (${row.entry_date})\n  ID: ${row.id}`;
}

export function buildProgressPhotoTools(userId: string, tz: string) {
  return {
    sparky_manage_progress_photos: tool({
      description: `Progress (check-in) photos: list the days a user has progress photos, list the photos for a specific day, and delete a photo.

This tool takes a FLAT object with an "action" field. Do NOT nest fields under the action name. Photos are uploaded through the app UI, not this tool.

Actions:
- action: 'list_photo_dates' — lists every calendar day (newest first) on which the user has at least one progress photo.
- action: 'list_photos' (fields: date) — lists the progress photos for a single day (front/back/side). Defaults to today.
- action: 'delete_photo' (fields: photo_id) — permanently deletes a single progress photo by its UUID. This is destructive; confirm with the user first.`,
      inputSchema: manageProgressPhotosInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs,
          tz,
          VALID_ACTIONS,
          (args) => {
            if (args.photo_id !== undefined) {
              return 'delete_photo';
            }
            if (args.date !== undefined) {
              return 'list_photos';
            }
            return 'list_photo_dates';
          }
        );
        const parsed = manageProgressPhotosSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: ManageProgressPhotosInput = parsed.data;
        try {
          switch (args.action) {
            case 'list_photo_dates': {
              const dates = await checkInPhotoService.getPhotoDates(userId);
              return formatList(
                dates,
                'Progress Photo Dates',
                (date: string) => `**${date}**`
              );
            }

            case 'list_photos': {
              const date = args.date ?? todayInZone(tz);
              const rows = (await checkInPhotoService.getPhotosByDate(
                userId,
                date
              )) as unknown as ProgressPhotoView[];
              return formatList(rows, `Progress Photos (${date})`, formatPhoto);
            }

            case 'delete_photo': {
              const deleted = await checkInPhotoService.deletePhoto(
                userId,
                args.photo_id
              );
              if (!deleted) {
                return ERRORS.NOT_FOUND('Progress photo', args.photo_id);
              }
              return formatConfirmation('Progress photo deleted.');
            }

            default:
              return ERRORS.INVALID_ACTION(
                String((args as ManageProgressPhotosInput).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          log('error', '[Progress Photos Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
