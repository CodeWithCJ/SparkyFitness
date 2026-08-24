import { tool } from 'ai';
import { log } from '../../config/logging.js';
import syncedDataService from '../../services/syncedDataService.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatConfirmation, formatList } from './formatting.js';
import {
  manageSyncedDataSchema,
  manageSyncedDataInput,
  type ManageSyncedDataInput,
} from './schemas/syncedData.js';
import { normalizeActionArgs } from './dates.js';

const VALID_ACTIONS = ['list_synced_sources', 'delete_synced_source'];

// Shape returned by syncedDataService.getSyncedSources. Only the rendered
// fields are declared; extra columns are ignored.
interface SyncedSourceView {
  source: string;
  totalCount: number;
  byTable?: Record<string, number>;
}

// Shape returned by syncedDataService.deleteSyncedSource.
interface DeleteResultView {
  totalDeleted: number;
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
    sparky_manage_synced_data: tool({
      description: `Synced provider data: list and bulk-delete the entry data a user has synced from external providers (e.g. garmin, healthkit, health_connect).

This tool takes a FLAT object with an "action" field. Do NOT nest fields under the action name.

Actions:
- action: 'list_synced_sources' — lists every provider source the user has synced data for, with per-table row counts. Hand-entered ("manual") data is never included.
- action: 'delete_synced_source' (fields: source) — permanently deletes ALL of the user's synced entries that came from a single provider source, across every synced table, in one transaction. Refuses to touch user-created data. This is destructive; confirm the source with the user first.`,
      inputSchema: manageSyncedDataInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs,
          tz,
          VALID_ACTIONS,
          (args) => {
            if (args.source !== undefined) {
              return 'delete_synced_source';
            }
            return 'list_synced_sources';
          }
        );
        const parsed = manageSyncedDataSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: ManageSyncedDataInput = parsed.data;
        try {
          switch (args.action) {
            case 'list_synced_sources': {
              const rows = (await syncedDataService.getSyncedSources(
                userId
              )) as unknown as SyncedSourceView[];
              return formatList(rows, 'Synced Provider Sources', formatSource);
            }

            case 'delete_synced_source': {
              const result = (await syncedDataService.deleteSyncedSource(
                userId,
                args.source
              )) as unknown as DeleteResultView;
              return formatConfirmation(
                `Deleted ${result.totalDeleted} synced row(s) from source "${args.source}".`
              );
            }

            default:
              return ERRORS.INVALID_ACTION(
                String((args as ManageSyncedDataInput).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (message.includes('User-created data cannot be bulk-deleted')) {
            return ERRORS.VALIDATION(
              'That source represents user-created data and cannot be bulk-deleted here.'
            );
          }
          log('error', '[Synced Data Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
