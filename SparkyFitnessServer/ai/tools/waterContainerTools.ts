import { tool } from 'ai';
import { log } from '../../config/logging.js';
import waterContainerService from '../../services/waterContainerService.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatConfirmation, formatList } from './formatting.js';
import {
  manageWaterContainersSchema,
  manageWaterContainersInput,
  WATER_CONTAINER_ACTIONS,
  type ManageWaterContainersInput,
} from './schemas/waterContainers.js';
import { normalizeActionArgs } from './dates.js';

const VALID_ACTIONS = [...WATER_CONTAINER_ACTIONS];

// Only the fields the tool renders are declared; the service returns additional
// columns (user_id, timestamps) that are intentionally ignored here. Volume is
// persisted in ml after the service converts from the supplied unit.
interface WaterContainerRow {
  id: number;
  name: string;
  volume: number;
  unit: string;
  is_primary: boolean;
  servings_per_container: number;
}

// Volume is persisted in ml regardless of the unit the user picked, so convert
// back to the container's own unit for display (mirrors the frontend
// convertMlToSelectedUnit helper in nutritionCalculations.ts).
function convertMlToUnit(ml: number, unit: string): number {
  switch (unit) {
    case 'oz':
      return ml / 29.5735;
    case 'liter':
      return ml / 1000;
    default:
      return ml;
  }
}

function formatVolume(ml: number, unit: string): string {
  const value = convertMlToUnit(ml, unit);
  // Round to 2dp; String() drops trailing zeros (24 -> "24", 1.5 -> "1.5").
  const rounded = Math.round(value * 100) / 100;
  return `${String(rounded)} ${unit}`;
}

function formatContainer(row: WaterContainerRow): string {
  const primary = row.is_primary ? ' — primary' : '';
  const servings =
    row.servings_per_container > 1
      ? ` (${row.servings_per_container} servings)`
      : '';
  return `**${row.name}** ${formatVolume(row.volume, row.unit)}${servings}${primary}\n  ID: ${row.id}`;
}

export function buildWaterContainerTools(userId: string, tz: string) {
  return {
    sparky_manage_water_containers: tool({
      description: `Water containers: list, view, create, update, delete, and set the primary reusable water vessel (name + volume + unit) a user taps for quick water logging. Volume is stored in ml; provide the unit (ml, oz, or liter) and it is converted automatically.

This tool takes a FLAT object with an "action" field. Do NOT nest fields under the action name.

Actions:
- action: 'list_water_containers' — returns all of the user's water containers (each with its ID)
- action: 'get_water_container' (fields: id) — returns a single water container
- action: 'create_water_container' (fields: name, volume, unit, optional is_primary, servings_per_container) — defines a new container
- action: 'update_water_container' (fields: id, optional name, volume, unit, is_primary, servings_per_container) — edits an existing container
- action: 'delete_water_container' (fields: id) — removes a container
- action: 'set_primary_water_container' (fields: id) — marks a container as the primary one`,
      inputSchema: manageWaterContainersInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs,
          tz,
          VALID_ACTIONS,
          (args) => {
            if (args.name !== undefined || args.volume !== undefined) {
              return args.id !== undefined
                ? 'update_water_container'
                : 'create_water_container';
            }
            if (args.id !== undefined) {
              return 'get_water_container';
            }
            return 'list_water_containers';
          }
        );
        const parsed = manageWaterContainersSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: ManageWaterContainersInput = parsed.data;
        try {
          switch (args.action) {
            case 'list_water_containers': {
              const rows =
                (await waterContainerService.getWaterContainersByUserId(
                  userId
                )) as unknown as WaterContainerRow[];
              return formatList(rows, 'Water Containers', formatContainer);
            }

            case 'get_water_container': {
              const rows =
                (await waterContainerService.getWaterContainersByUserId(
                  userId
                )) as unknown as WaterContainerRow[];
              const row = rows.find((r) => r.id === args.id);
              if (!row) {
                return ERRORS.NOT_FOUND('Water container', String(args.id));
              }
              return formatList([row], 'Water Container', formatContainer);
            }

            case 'create_water_container': {
              const row = (await waterContainerService.createWaterContainer(
                userId,
                {
                  name: args.name,
                  volume: args.volume,
                  unit: args.unit,
                  is_primary: args.is_primary ?? false,
                  servings_per_container: args.servings_per_container ?? 1,
                }
              )) as unknown as WaterContainerRow;
              return formatConfirmation(
                `Water container **${row.name}** created (ID: ${row.id}).`
              );
            }

            case 'update_water_container': {
              const row = (await waterContainerService.updateWaterContainer(
                args.id,
                userId,
                {
                  name: args.name,
                  volume: args.volume,
                  unit: args.unit,
                  is_primary: args.is_primary,
                  servings_per_container: args.servings_per_container,
                }
              )) as unknown as WaterContainerRow | undefined;
              if (!row) {
                return ERRORS.NOT_FOUND('Water container', String(args.id));
              }
              return formatConfirmation(
                `Water container **${row.name}** updated.`
              );
            }

            case 'delete_water_container': {
              await waterContainerService.deleteWaterContainer(args.id, userId);
              return formatConfirmation('Water container deleted.');
            }

            case 'set_primary_water_container': {
              const row = (await waterContainerService.setPrimaryWaterContainer(
                args.id,
                userId
              )) as unknown as WaterContainerRow | undefined;
              if (!row) {
                return ERRORS.NOT_FOUND('Water container', String(args.id));
              }
              return formatConfirmation(
                `Water container **${row.name}** set as primary.`
              );
            }

            default:
              return ERRORS.INVALID_ACTION(
                String((args as ManageWaterContainersInput).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (message.includes('not found')) {
            return ERRORS.NOT_FOUND(
              'Water container',
              'id' in args ? String(args.id) : ''
            );
          }
          log('error', '[Water Containers Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
