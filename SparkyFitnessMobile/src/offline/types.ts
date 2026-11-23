import type { ServerConfig } from '../services/storage';
/** A value SQLite can bind. */
export type SqlParam = string | number | null;

/**
 * The small part of a SQLite connection the offline code uses. The app runs
 * it on expo-sqlite; tests run the same SQL on an in-memory database.
 */
export interface OfflineDb {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParam[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  /** Runs `task` in one transaction; a throw rolls everything back. */
  transaction<T>(task: (tx: OfflineDb) => Promise<T>): Promise<T>;
}

/**
 * Where an upload stands.
 * - `pending`: waiting for the server to be reachable (or for its turn).
 * - `sending`: a request is in flight. Reset to `pending` at app start.
 * - `conflict`: the server copy changed or is gone; the person decides.
 * - `needs_sign_in`: the server refused the credentials.
 * - `failed`: the server refused the request itself; kept for the person.
 * - `synced`: confirmed by the server; kept a few days as a safety copy.
 */
export type OutboxStatus =
  'pending' | 'sending' | 'conflict' | 'needs_sign_in' | 'failed' | 'synced';

/** One piece of work the server has not confirmed yet. */
export interface OutboxRow {
  id: string;
  serverConfigId: string;
  /** The account that made it; never uploaded under another one. */
  userId: string | null;
  kind: string;
  /** What the work is about, e.g. the workout session's id. */
  entityId: string;
  /** Another row that must be confirmed first, or null. */
  dependsOn: string | null;
  /** Calendar day (YYYY-MM-DD) the work belongs to, when it has one. */
  entryDate: string | null;
  payload: unknown;
  payloadVersion: number;
  /** The server revision this phone last saw; null for a create. */
  baseRevision: number | null;
  /** The snapshot last sent, to recognise this phone's own earlier save. */
  lastSent: unknown;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
  syncedAt: number | null;
  /** When the "still waiting" reminder was shown, or null. */
  remindedAt: number | null;
}

/** What sending one row came to. */
export type SendResult =
  | { outcome: 'synced' }
  /** The server could not be reached or asked to wait; try again later. */
  | { outcome: 'retry'; error?: string }
  | { outcome: 'conflict'; error?: string }
  | { outcome: 'needs_sign_in' }
  | { outcome: 'failed'; error: string };

/**
 * What the drain knows about the run a row is sent in. `serverConfig` is the
 * server read when the run started: a handler sends to it, not to whichever
 * server is active when its request goes out, so a switch in between cannot
 * carry one account's row to another's server. Absent, the active one is used.
 */
export interface SendContext {
  serverConfig?: ServerConfig;
}

/** Sends one kind of outbox row. A new offline module adds one of these. */
export interface OutboxHandler {
  kind: string;
  /** The payload shape this build writes. */
  payloadVersion: number;
  /** Brings a payload written by an older build up to `payloadVersion`. */
  upgrade(payload: unknown, fromVersion: number): unknown;
  send(row: OutboxRow, context?: SendContext): Promise<SendResult>;
  /** Runs once the server has confirmed the row (cache refreshes). */
  onSynced?(row: OutboxRow): Promise<void> | void;
}
