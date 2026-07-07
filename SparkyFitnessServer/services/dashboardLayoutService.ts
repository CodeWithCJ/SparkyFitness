import dashboardLayoutRepository, {
  type DashboardLayoutInput,
} from '../models/dashboardLayoutRepository.js';
import { log } from '../config/logging.js';

// Pages that are allowed to persist a widget layout. Kept as an allow-list so a
// bad/unknown page_key can't write arbitrary rows.
const ALLOWED_PAGE_KEYS = new Set(['diary', 'reports-measurements']);

interface HttpError extends Error {
  status?: number;
}

function badRequest(message: string): HttpError {
  const err: HttpError = new Error(message);
  err.status = 400;
  return err;
}

function assertValidPageKey(pageKey: string): void {
  if (!ALLOWED_PAGE_KEYS.has(pageKey)) {
    throw badRequest(`Unknown dashboard page_key: ${pageKey}`);
  }
}

function assertValidPayload(data: DashboardLayoutInput): void {
  if (
    typeof data.layout !== 'object' ||
    data.layout === null ||
    Array.isArray(data.layout)
  ) {
    throw badRequest('layout must be an object keyed by breakpoint');
  }
  if (!Array.isArray(data.hidden)) {
    throw badRequest('hidden must be an array of widget keys');
  }
}

async function getDashboardLayout(userId: string, pageKey: string) {
  assertValidPageKey(pageKey);
  const row = await dashboardLayoutRepository.getDashboardLayout(
    userId,
    pageKey
  );
  if (!row) {
    // No saved layout: let the client fall back to its generated default.
    return null;
  }
  return { layout: row.layout, hidden: row.hidden, updated_at: row.updated_at };
}

async function saveDashboardLayout(
  userId: string,
  pageKey: string,
  data: DashboardLayoutInput
) {
  assertValidPageKey(pageKey);
  assertValidPayload(data);
  log('debug', `Saving dashboard layout for user ${userId}, page ${pageKey}`);
  const row = await dashboardLayoutRepository.upsertDashboardLayout(
    userId,
    pageKey,
    { layout: data.layout, hidden: data.hidden }
  );
  return { layout: row.layout, hidden: row.hidden, updated_at: row.updated_at };
}

async function resetDashboardLayout(userId: string, pageKey: string) {
  assertValidPageKey(pageKey);
  log(
    'debug',
    `Resetting dashboard layout for user ${userId}, page ${pageKey}`
  );
  await dashboardLayoutRepository.deleteDashboardLayout(userId, pageKey);
}

export { getDashboardLayout, saveDashboardLayout, resetDashboardLayout };
export default {
  getDashboardLayout,
  saveDashboardLayout,
  resetDashboardLayout,
};
