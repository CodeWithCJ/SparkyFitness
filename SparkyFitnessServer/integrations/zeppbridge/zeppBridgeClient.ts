/**
 * Client for ZeppBridge's read-only pull API (`zeppbridge-cli serve`). Every
 * request goes through the guarded fetch of the provider's owner (SSRF policy,
 * no redirects) and carries the pull token as a bearer token. SparkyFitness
 * never talks to Zepp itself.
 */
import { addDays, compareDays } from '@workspace/shared';
import { log } from '../../config/logging.js';
import {
  SUPPORTED_RECORDS_MAJOR,
  addRecords,
  emptyRecordSet,
  recordsPageSchema,
  recordsVersionMajor,
  zeppBridgeInfoSchema,
  type ZeppBridgeInfo,
  type ZeppBridgeRecordSet,
  type ZeppBridgeWorkout,
} from './zeppBridgeTypes.js';

/** ZeppBridge answers at most this many days per request. */
export const MAX_DAYS_PER_REQUEST = 92;
const PAGE_LIMIT = 2000;
// What one span may hold. Per-minute heart rate over 92 days is about 66 pages
// of 2000, so this leaves room for real data (500k records) while a server that
// keeps handing out cursors is stopped instead of growing the sync without limit.
const MAX_PAGES_PER_SPAN = 250;
// The largest single answer read into memory.
const MAX_BODY_BYTES = 50 * 1024 * 1024;
/** How long one sync may keep talking to the remote server in all. */
export const MAX_SYNC_MS = 20 * 60_000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRY_AFTER_MS = 60_000;
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_CURSOR_RESTARTS = 2;
// Without these ZeppBridge returns only sleep, heart rate, HRV, activity,
// workouts and weight; the names are the ones its read contract documents.
const DEFAULT_TYPES = 'sleep,heart_rate,hrv,activity,workouts,weight';

export interface ZeppBridgeConnection {
  /** The stored base URL, scheme included (never ends with a slash). */
  baseUrl: string;
  token: string;
  fetch: typeof fetch;
  /** Epoch ms after which no further request is made; unset means no limit. */
  deadlineAt?: number;
}

export class ZeppBridgeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
    readonly retryAfterMs: number | null = null
  ) {
    super(message);
    this.name = 'ZeppBridgeError';
  }
}

/** HTTP status of a ZeppBridge failure (0 when it was not an HTTP answer). */
export function zeppBridgeErrorStatus(error: unknown): number {
  return error instanceof ZeppBridgeError ? error.status : 0;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function errorFromResponse(response: Response): Promise<ZeppBridgeError> {
  let code: string | null = null;
  let message = `ZeppBridge answered HTTP ${response.status}`;
  try {
    const body = (await response.json()) as {
      error?: { code?: unknown; message?: unknown };
    };
    if (typeof body.error?.code === 'string') code = body.error.code;
    if (typeof body.error?.message === 'string') message = body.error.message;
  } catch {
    // Not JSON (a proxy page, for example): keep the status-only message.
  }
  const seconds = Number(response.headers.get('retry-after'));
  const retryAfterMs =
    response.status === 429
      ? Number.isFinite(seconds) && seconds >= 0
        ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
        : 5_000
      : null;
  return new ZeppBridgeError(message, response.status, code, retryAfterMs);
}

/** Reads a JSON body without ever holding more than MAX_BODY_BYTES of it. */
async function readJsonCapped(response: Response): Promise<unknown> {
  const tooLarge = () =>
    new ZeppBridgeError(
      'ZeppBridge sent a larger answer than SparkyFitness accepts. Narrow the date range or check the ZeppBridge server.',
      0,
      'response_too_large'
    );
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw tooLarge();

  let text: string;
  try {
    const reader = response.body?.getReader();
    if (!reader) {
      text = await response.text();
      if (text.length > MAX_BODY_BYTES) throw tooLarge();
    } else {
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > MAX_BODY_BYTES) {
          await reader.cancel();
          throw tooLarge();
        }
        chunks.push(value);
      }
      text = Buffer.concat(chunks).toString('utf8');
    }
  } catch (error) {
    if (error instanceof ZeppBridgeError) throw error;
    // The connection dropped or timed out while the answer was coming in.
    throw new ZeppBridgeError(
      `Could not read the answer from ZeppBridge: ${error instanceof Error ? error.message : String(error)}`,
      0
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    // A router, proxy or web page answered 200 with something that is not JSON.
    throw new ZeppBridgeError(
      'That address answered, but not like a ZeppBridge server.',
      0,
      'not_zeppbridge'
    );
  }
}

async function getJson(
  connection: ZeppBridgeConnection,
  path: string,
  query: URLSearchParams | null
): Promise<unknown> {
  const url = `${connection.baseUrl}${path}${query ? `?${query.toString()}` : ''}`;
  for (let attempt = 0; ; attempt += 1) {
    const remaining =
      connection.deadlineAt === undefined
        ? Number.POSITIVE_INFINITY
        : connection.deadlineAt - Date.now();
    if (remaining <= 0) {
      // A sync that has stopped answering to the app must not keep fetching.
      throw new ZeppBridgeError(
        'The ZeppBridge sync took too long and was stopped.',
        0,
        'sync_timeout'
      );
    }
    let response: Response;
    try {
      response = await connection.fetch(url, {
        headers: {
          Authorization: `Bearer ${connection.token}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining)),
      });
    } catch (error) {
      // Never the URL or headers: they carry the token.
      throw new ZeppBridgeError(
        `Could not reach ZeppBridge: ${error instanceof Error ? error.message : String(error)}`,
        0
      );
    }
    if (response.ok) return readJsonCapped(response);
    const failure = await errorFromResponse(response);
    if (failure.retryAfterMs !== null && attempt < MAX_RATE_LIMIT_RETRIES) {
      log(
        'warn',
        `[zeppBridgeClient] Rate limited; retrying in ${failure.retryAfterMs}ms.`
      );
      await sleep(failure.retryAfterMs);
      continue;
    }
    throw failure;
  }
}

function checkRecordsVersion(version: unknown): void {
  const major = recordsVersionMajor(version);
  if (major === null || major > SUPPORTED_RECORDS_MAJOR) {
    throw new ZeppBridgeError(
      `This ZeppBridge uses a newer record format (${String(version)}) than this SparkyFitness understands. Update SparkyFitness.`,
      0,
      'records_version_unsupported'
    );
  }
}

/** `GET /v1`: proves the URL and token work and reports the record format. */
export async function fetchZeppBridgeInfo(
  connection: ZeppBridgeConnection
): Promise<ZeppBridgeInfo> {
  const info = zeppBridgeInfoSchema.safeParse(
    await getJson(connection, '/v1', null)
  );
  if (!info.success) {
    throw new ZeppBridgeError(
      'That address answered, but not like a ZeppBridge server.',
      0,
      'not_zeppbridge'
    );
  }
  checkRecordsVersion(info.data.records_version);
  return info.data;
}

/** `[from, to]` cut into spans of at most MAX_DAYS_PER_REQUEST days. */
export function splitDayRange(
  from: string,
  to: string
): Array<{ from: string; to: string }> {
  const spans: Array<{ from: string; to: string }> = [];
  let start = from;
  while (compareDays(start, to) <= 0) {
    const end = addDays(start, MAX_DAYS_PER_REQUEST - 1);
    const last = compareDays(end, to) < 0 ? end : to;
    spans.push({ from: start, to: last });
    start = addDays(last, 1);
  }
  return spans;
}

/** Every record of a span of at most 92 days, following the page cursor. */
async function fetchSpan(
  connection: ZeppBridgeConnection,
  span: { from: string; to: string },
  types: string,
  extraParams: Record<string, string> = {}
): Promise<ZeppBridgeRecordSet> {
  for (let restart = 0; ; restart += 1) {
    const set = emptyRecordSet();
    let cursor: string | null = null;
    let pages = 0;
    try {
      do {
        pages += 1;
        if (pages > MAX_PAGES_PER_SPAN) {
          throw new ZeppBridgeError(
            `ZeppBridge sent more than ${MAX_PAGES_PER_SPAN} pages for ${span.from} to ${span.to}. Narrow the date range or check the ZeppBridge server.`,
            0,
            'too_many_pages'
          );
        }
        const query = new URLSearchParams({
          from: span.from,
          to: span.to,
          types,
          limit: String(PAGE_LIMIT),
          ...extraParams,
        });
        if (cursor) query.set('cursor', cursor);
        const page = recordsPageSchema.safeParse(
          await getJson(connection, '/v1/records', query)
        );
        if (!page.success) {
          throw new ZeppBridgeError(
            'ZeppBridge answered with records in a shape SparkyFitness does not understand.',
            0,
            'bad_records_page'
          );
        }
        checkRecordsVersion(page.data.records_version);
        addRecords(set, page.data.records);
        cursor = page.data.next_cursor ?? null;
      } while (cursor);
      return set;
    } catch (error) {
      // A snapshot lives about 30 seconds; a long import can outlive it.
      if (
        error instanceof ZeppBridgeError &&
        error.code === 'cursor_expired' &&
        restart < MAX_CURSOR_RESTARTS
      ) {
        log('warn', '[zeppBridgeClient] Cursor expired; restarting the span.');
        continue;
      }
      throw error;
    }
  }
}

/**
 * The workouts of a day range with their route and per-second samples
 * (`detail=full`, GPS included), in spans of at most 92 days. Used only for
 * workouts that still need them.
 */
export async function fetchZeppBridgeWorkoutDetail(
  connection: ZeppBridgeConnection,
  from: string,
  to: string
): Promise<ZeppBridgeWorkout[]> {
  const workouts: ZeppBridgeWorkout[] = [];
  for (const span of splitDayRange(from, to)) {
    const set = await fetchSpan(connection, span, 'workouts', {
      detail: 'full',
      include_gps: 'true',
    });
    workouts.push(...set.workouts);
  }
  return workouts;
}

/** Fetches a day range span by span, handing each span's records to `onSpan`. */
export async function pullZeppBridgeRecords(
  connection: ZeppBridgeConnection,
  from: string,
  to: string,
  onSpan: (
    records: ZeppBridgeRecordSet,
    span: { from: string; to: string }
  ) => Promise<void>,
  types: string = DEFAULT_TYPES
): Promise<void> {
  for (const span of splitDayRange(from, to)) {
    await onSpan(await fetchSpan(connection, span, types), span);
  }
}
