import { vi, beforeEach, describe, expect, it } from 'vitest';
import { buildSyncedDataTools } from '../ai/tools/syncedDataTools.js';
import syncedDataService from '../services/syncedDataService.js';

vi.mock('../services/syncedDataService.js', () => ({
  default: {
    getSyncedSources: vi.fn(),
    deleteSyncedSource: vi.fn(),
  },
}));
vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

const svc = syncedDataService as unknown as {
  getSyncedSources: ReturnType<typeof vi.fn>;
  deleteSyncedSource: ReturnType<typeof vi.fn>;
};

const opts = { toolCallId: 'tc-1', messages: [] };
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

let tools: ReturnType<typeof buildSyncedDataTools>;

beforeEach(() => {
  vi.clearAllMocks();
  tools = buildSyncedDataTools('user-1', 'UTC');
});

describe('sparky_get_synced_data', () => {
  it('list_synced_sources renders sources with per-table breakdown', async () => {
    svc.getSyncedSources.mockResolvedValue([
      {
        source: 'garmin',
        totalCount: 42,
        byTable: { exercise_entries: 30, check_in_measurements: 12 },
      },
      { source: 'healthkit', totalCount: 5, byTable: { sleep_data: 5 } },
    ]);

    const result = await tools.sparky_get_synced_data.execute!(
      { action: 'list_synced_sources' },
      opts
    );

    expect(result).toBe(
      '# Synced Provider Sources\n\n' +
        '**garmin** — 42 synced row(s)\n  exercise_entries: 30, check_in_measurements: 12\n\n' +
        '**healthkit** — 5 synced row(s)\n  sleep_data: 5'
    );
    expect(svc.getSyncedSources).toHaveBeenCalledWith('user-1');
  });

  it('list_synced_sources reports when there are none', async () => {
    svc.getSyncedSources.mockResolvedValue([]);

    const result = await tools.sparky_get_synced_data.execute!(
      { action: 'list_synced_sources' },
      opts
    );

    expect(result).toBe('# Synced Provider Sources\n\nNo results found.');
  });

  it('infers list_synced_sources when no action or fields are provided', async () => {
    svc.getSyncedSources.mockResolvedValue([]);

    const result = await tools.sparky_get_synced_data.execute!({}, opts);

    expect(result).toBe('# Synced Provider Sources\n\nNo results found.');
  });

  // The bulk delete-by-source operation is deliberately not exposed to the AI:
  // it is irreversible, spans every synced table, and takes no date bound, so a
  // single inferred call could wipe months of history. It stays in the web UI.
  //
  // The published input type no longer admits these shapes, but a model can
  // still emit them at runtime, so they are cast to exercise the reject path.
  const callRaw = (args: Record<string, unknown>) =>
    tools.sparky_get_synced_data.execute!(
      args as NonNullable<
        Parameters<NonNullable<typeof tools.sparky_get_synced_data.execute>>[0]
      >,
      opts
    );

  it('does not expose delete_synced_source', async () => {
    const result = await callRaw({
      action: 'delete_synced_source',
      source: 'garmin',
    });

    expect(result).toContain('Error [');
    expect(svc.deleteSyncedSource).not.toHaveBeenCalled();
  });

  it('ignores a stray source field instead of deleting', async () => {
    svc.getSyncedSources.mockResolvedValue([]);

    const result = await callRaw({ source: 'garmin' });

    expect(svc.deleteSyncedSource).not.toHaveBeenCalled();
    expect(result).not.toContain('Deleted');
  });

  it('returns DB_ERROR when the service throws', async () => {
    svc.getSyncedSources.mockRejectedValue(new Error('boom'));

    const result = await tools.sparky_get_synced_data.execute!(
      { action: 'list_synced_sources' },
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });
});
