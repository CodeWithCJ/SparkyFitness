import { tool } from 'ai';
import { log } from '../../config/logging.js';
import userRepository from '../../models/userRepository.js';
import preferenceService from '../../services/preferenceService.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatConfirmation } from './formatting.js';
import { normalizeActionArgs } from './dates.js';
import {
  manageProfileSchema,
  manageProfileInput,
  type ManageProfileInput,
} from './schemas/profile.js';

const VALID_ACTIONS = [
  'get_profile',
  'update_profile',
  'get_preferences',
  'update_preferences',
];

export function buildProfileTools(userId: string) {
  return {
    sparky_manage_profile: tool({
      description: `User settings: update display name, timezone, and measurement units.

This tool takes a FLAT object with an "action" field. Do NOT nest fields under the action name.

Actions:
- action: 'get_profile' — returns user account details
- action: 'update_profile' (fields: display_name?, email?, image?) — updates account details
- action: 'get_preferences' — returns user preferences (timezone, units)
- action: 'update_preferences' (fields: timezone?, energy_unit?, default_weight_unit?, default_distance_unit?, default_measurement_unit?, water_display_unit?) — updates preferences`,
      inputSchema: manageProfileInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs,
          'UTC',
          VALID_ACTIONS,
          (args) => {
            if (
              args.timezone !== undefined ||
              args.energy_unit !== undefined ||
              args.default_weight_unit !== undefined ||
              args.default_measurement_unit !== undefined ||
              args.default_distance_unit !== undefined ||
              args.water_display_unit !== undefined
            ) {
              return 'update_preferences';
            }
            if (
              args.display_name !== undefined ||
              args.email !== undefined ||
              args.image !== undefined
            ) {
              return 'update_profile';
            }
            return undefined;
          }
        );
        const parsed = manageProfileSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: ManageProfileInput = parsed.data;
        try {
          switch (args.action) {
            case 'get_profile': {
              const profile =
                (await userRepository.getAuthUserProfile(userId)) || {};
              let text = '### User Profile\n\n';
              text += `- **Name:** ${profile.name || 'N/A'}\n`;
              text += `- **Email:** ${profile.email}\n`;
              text += `- **ID:** ${profile.id}\n`;
              return text;
            }

            case 'update_profile': {
              await userRepository.updateAuthUserProfile(
                userId,
                args.display_name ?? null,
                args.email ?? null,
                args.image ?? null
              );
              return formatConfirmation('Profile updated.');
            }

            case 'get_preferences': {
              const prefs = await preferenceService.getUserPreferences(
                userId,
                userId
              );
              let text = '### User Preferences\n\n';
              text += `- **Timezone:** ${prefs.timezone || 'UTC'}\n`;
              text += `- **Energy Unit:** ${prefs.energy_unit || 'kcal'}\n`;
              text += `- **Weight Unit:** ${prefs.default_weight_unit || 'kg'}\n`;
              text += `- **Distance Unit:** ${prefs.default_distance_unit || 'km'}\n`;
              return text;
            }

            case 'update_preferences': {
              const preferenceData = {
                timezone: args.timezone ?? null,
                energy_unit: args.energy_unit ?? null,
                default_weight_unit: args.default_weight_unit ?? null,
                default_measurement_unit: args.default_measurement_unit ?? null,
                default_distance_unit: args.default_distance_unit ?? null,
                water_display_unit: args.water_display_unit ?? null,
              };
              try {
                await preferenceService.updateUserPreferences(
                  userId,
                  userId,
                  preferenceData
                );
              } catch (error) {
                if (
                  error instanceof Error &&
                  error.message.startsWith('Invalid timezone:')
                ) {
                  return ERRORS.VALIDATION(error.message);
                }
                if (
                  error instanceof Error &&
                  error.message.includes('not found')
                ) {
                  // No preferences row yet; create one with the given fields.
                  await preferenceService.upsertUserPreferences(userId, {
                    ...preferenceData,
                  });
                  return formatConfirmation('Preferences updated.');
                }
                throw error;
              }
              return formatConfirmation('Preferences updated.');
            }

            default:
              return ERRORS.INVALID_ACTION(
                String((args as any).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          log('error', '[Profile Tool] Error:', error);
          return ERRORS.DB_ERROR();
        }
      },
    }),
  };
}
