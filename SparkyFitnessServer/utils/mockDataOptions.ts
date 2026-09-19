import { isMockDataEnabled } from '../models/globalSettingsRepository.js';
import { resolveIsAdminByUserId } from './adminCheck.js';

export interface MockDataOptions {
  /** Provider slug, or 'local' to replay a previously captured bundle. */
  dataSource?: string;
  /** Whether to write this sync's raw provider responses to mock_data/. */
  saveMockData: boolean;
}

const DISABLED: MockDataOptions = {
  dataSource: undefined,
  saveMockData: false,
};

/**
 * Resolves the per-sync mock-data options from a request body.
 *
 * Both options are developer/support tooling: one makes the server write raw
 * provider responses to disk, the other replays them instead of calling the
 * provider.
 *
 * Two gates, both required. The `mock_data_enabled` global setting is off by
 * default, so on a normal instance neither capability exists at all. On top of
 * that the caller must be an admin, because a captured bundle is stored per
 * provider (`mock_data/<provider>_raw.json`) and not per user: without the
 * admin gate, one user could capture their raw sleep, heart-rate, GPS and
 * nutrition data and a second user could replay that same file into their own
 * account. Admins are already the trusted operator role for this instance.
 */
export async function resolveMockDataOptions(
  body: unknown,
  authenticatedUserId?: string
): Promise<MockDataOptions> {
  if (!(await isMockDataEnabled())) {
    return DISABLED;
  }
  if (
    !authenticatedUserId ||
    !(await resolveIsAdminByUserId(authenticatedUserId))
  ) {
    return DISABLED;
  }
  const source = body as
    { dataSource?: unknown; saveMockData?: unknown } | null | undefined;
  return {
    dataSource:
      typeof source?.dataSource === 'string' ? source.dataSource : undefined,
    saveMockData: source?.saveMockData === true,
  };
}
