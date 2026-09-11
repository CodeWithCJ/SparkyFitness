import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPool } from '../db/poolManager.js';
import { log } from '../config/logging.js';

vi.mock('pg', async (importOriginal) => {
  const original = await importOriginal<typeof import('pg')>();
  return {
    default: {
      ...original.default,
      Pool: class extends EventEmitter {
        end = vi.fn();
      },
    },
  };
});
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('idle database errors', () => {
  it.each(['owner', 'app'] as const)(
    'logs an idle %s error without exiting the process',
    async (role) => {
      const pools = await resetPool();
      const pool = pools[`${role}PoolInstance`];
      const error = new Error('Connection terminated unexpectedly');
      const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exited');
      });

      expect(() => pool.emit('error', error)).not.toThrow();
      expect(log).toHaveBeenCalledWith(
        'error',
        `Unexpected error on idle ${role} client`,
        error
      );
      expect(exit).not.toHaveBeenCalled();
    }
  );
});
