import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { getRawOwnerPool, handleConnectionLoss } from '../db/poolManager.js';

/** A checked-out client: pg-pool has removed its own 'error' listener. */
function checkOut(pool: EventEmitter) {
  const client = Object.assign(new EventEmitter(), { query: vi.fn() });
  pool.emit('connect', client);
  return client;
}

describe('a dropped connection on a checked-out client', () => {
  it('does not throw when the pool handles connection loss', () => {
    const pool = new EventEmitter();
    handleConnectionLoss(pool as never, 'app');
    const client = checkOut(pool);

    expect(() =>
      client.emit('error', new Error('Connection terminated unexpectedly'))
    ).not.toThrow();
  });

  it('is handled for the server pools', () => {
    const client = checkOut(getRawOwnerPool());

    expect(() =>
      client.emit('error', new Error('Connection terminated unexpectedly'))
    ).not.toThrow();
  });
});
