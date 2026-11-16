import { WEB_TABS_PAGE_KEY, isWebHideableTabId } from '@workspace/shared';
import dashboardLayoutRepository, {
  type DashboardLayoutInput,
} from '../models/dashboardLayoutRepository.js';
import { log } from '../config/logging.js';

// Pages that are allowed to persist a widget layout. Kept as an allow-list so a
// bad/unknown page_key can't write arbitrary rows. `web-tabs` is not a widget
// grid: its `hidden` list holds the main web tabs a person turned off.
const ALLOWED_PAGE_KEYS = new Set([
  'diary',
  'reports-measurements',
  'reports-nutrients',
  WEB_TABS_PAGE_KEY,
]);

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

// The hidden main web tabs: known tab ids only, each at most once. The page has
// no grid, so whatever `layout` was sent is stored as {}.
function webTabsPayload(data: DashboardLayoutInput): DashboardLayoutInput {
  if (
    !Array.isArray(data.hidden) ||
    !data.hidden.every(isWebHideableTabId) ||
    new Set(data.hidden).size !== data.hidden.length
  ) {
    throw badRequest('hidden must list each hideable tab id at most once');
  }
  return { layout: {}, hidden: data.hidden };
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
  let payload: DashboardLayoutInput;
  if (pageKey === WEB_TABS_PAGE_KEY) {
    payload = webTabsPayload(data);
  } else {
    assertValidPayload(data);
    payload = { layout: data.layout, hidden: data.hidden };
  }
  log('debug', `Saving dashboard layout for user ${userId}, page ${pageKey}`);
  const row = await dashboardLayoutRepository.upsertDashboardLayout(
    userId,
    pageKey,
    payload
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
