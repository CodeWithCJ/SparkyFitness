import { tool } from 'ai';
import { log } from '../../config/logging.js';
import syncedDataService from '../../services/syncedDataService.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatList } from './formatting.js';
import {
  syncedDataSchema,
  syncedDataInput,
  type SyncedDataInput,
} from './schemas/syncedData.js';
import { normalizeActionArgs } from './dates.js';

const VALID_ACTIONS = ['list_synced_sources'];

// Shape returned by syncedDataService.getSyncedSources. Only the rendered
// fields are declared; extra columns are ignored.
interface SyncedSourceView {
  source: string;
  totalCount: number;
  byTable?: Record<string, number>;
}

function formatSource(row: SyncedSourceView): string {
  const tables =
    row.byTable !== undefined && row.byTable !== null
      ? Object.entries(row.byTable)
          .map(([table, count]) => `${table}: ${count}`)
          .join(', ')
      : '';
  const breakdown = tables !== '' ? `\n  ${tables}` : '';
  return `**${row.source}** — ${row.totalCount} synced row(s)${breakdown}`;
}

export function buildSyncedDataTools(userId: string, tz: string) {
  return {
    sparky_get_synced_data: tool({
      // Read-only by design. Bulk-deleting a provider's data is irreversible,
      // spans every synced table, and cannot be scoped to a date range, so it
      // stays in the web UI (Settings -> synced data) where the user confirms
      // it against visible counts. Exposing it here would let a single inferred
      // tool call wipe months of history with no undo.
      description: `Synced provider data: list the entry data a user has synced from external providers (e.g. garmin, healthkit, health_connect). Read-only.

This tool takes a FLAT object with an "action" field. Do NOT nest fields under the action name.

Actions:
- action: 'list_synced_sources' — lists every provider source the user has synced data for, with per-table row counts. Hand-entered ("manual") data is never included.

Deleting synced data is not available here. If the user wants to remove a provider's synced data, direct them to the app's synced-data settings.`,
      inputSchema: syncedDataInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs,
          tz,
          VALID_ACTIONS,
          () => 'list_synced_sources'
        );
        const parsed = syncedDataSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: SyncedDataInput = parsed.data;
        try {
          switch (args.action) {
            case 'list_synced_sources': {
              const rows = (await syncedDataService.getSyncedSources(
                userId
              )) as unknown as SyncedSourceView[];
              return formatList(rows, 'Synced Provider Sources', formatSource);
            }

            default:
              return ERRORS.INVALID_ACTION(
                String((args as SyncedDataInput).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          log('error', '[Synced Data Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
