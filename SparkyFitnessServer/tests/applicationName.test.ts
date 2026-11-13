import { describe, expect, it } from 'vitest';
import { applicationName } from '../db/applicationName.js';

// Kubernetes pod names: a long release prefix, then the part that differs.
const POD_A = 'sparkyfitness-production-long-release-server-7bb99c5549-abcde';
const POD_B = 'sparkyfitness-production-long-release-server-7bb99c5549-fghij';

describe('applicationName', () => {
  it('keeps a name that fits as pool@host:pid', () => {
    expect(applicationName('app', 'pod-a', 1)).toBe(
      'sparkyfitness-app@pod-a:1'
    );
  });

  it('tells apart long hostnames that differ only past the 63-byte limit', () => {
    // Cut to 63 bytes alone, the two pods' names are identical.
    const cut = (host: string) => `sparkyfitness-owner@${host}:1`.slice(0, 63);
    expect(cut(POD_A)).toBe(cut(POD_B));

    for (const pool of ['owner', 'app', 'auth'] as const) {
      const a = applicationName(pool, POD_A, 1);
      const b = applicationName(pool, POD_B, 1);
      expect(a).not.toBe(b);
      for (const name of [a, b]) {
        expect(Buffer.byteLength(name)).toBeLessThanOrEqual(63);
        expect(
          name.startsWith(`sparkyfitness-${pool}@sparkyfitness-production-`)
        ).toBe(true);
        expect(name).toMatch(/#[0-9a-f]{10}$/);
      }
    }
  });

  it('tells apart two processes on one long-named host', () => {
    expect(applicationName('app', POD_A, 7)).not.toBe(
      applicationName('app', POD_A, 8)
    );
  });

  it('is stable for one process', () => {
    expect(applicationName('auth', POD_A, 1)).toBe(
      applicationName('auth', POD_A, 1)
    );
  });

  it('stays within 63 bytes, as PostgreSQL stores it, for a non-ASCII hostname', () => {
    const name = applicationName('owner', `${'é'.repeat(40)}-pod`, 1);
    expect(name).toMatch(/^[\x20-\x7e]+$/);
    expect(name.length).toBeLessThanOrEqual(63);
  });
});
