import { describe, it, expect } from 'vitest';
import { localDateTimeToUtc, activeCaffeineAt } from '@workspace/shared';
import type { CaffeineDose } from '@workspace/shared';

describe('Caffeine Kinetics - Midnight Boundary and Timezone Invariance', () => {
  it('correctly spans midnight across calendar days in America/Los_Angeles with exact Δt = 3.5h', () => {
    const tz = 'America/Los_Angeles';

    // Logged: 2026-09-04 at 21:00 local (PDT = UTC-7)
    const doseUtcDate = localDateTimeToUtc('2026-09-04T21:00', tz);
    expect(doseUtcDate.toISOString()).toBe('2026-09-05T04:00:00.000Z');

    const doses: CaffeineDose[] = [
      {
        at: doseUtcDate.toISOString(),
        mg: 100,
      },
    ];

    // Evaluated: 2026-09-05 at 00:30 local (PDT = UTC-7)
    const nowUtcDate = localDateTimeToUtc('2026-09-05T00:30', tz);
    expect(nowUtcDate.toISOString()).toBe('2026-09-05T07:30:00.000Z');

    // Δt in hours
    const deltaHours =
      (nowUtcDate.getTime() - doseUtcDate.getTime()) / (1000 * 60 * 60);
    expect(deltaHours).toBe(3.5);

    // Active caffeine with 5.0h half-life
    const active = activeCaffeineAt(doses, nowUtcDate.toISOString(), 5.0);
    const expected = Number((100 * Math.pow(2, -3.5 / 5.0)).toFixed(2));
    expect(active).toBe(expected);
  });

  it('produces identical elapsed time and active caffeine in Pacific/Auckland for identical wall-clock inputs', () => {
    const tz = 'Pacific/Auckland';

    // Logged: 2026-09-04 at 21:00 local (NZST = UTC+12)
    const doseUtcDate = localDateTimeToUtc('2026-09-04T21:00', tz);
    expect(doseUtcDate.toISOString()).toBe('2026-09-04T09:00:00.000Z');

    const doses: CaffeineDose[] = [
      {
        at: doseUtcDate.toISOString(),
        mg: 100,
      },
    ];

    // Evaluated: 2026-09-05 at 00:30 local (NZST = UTC+12)
    const nowUtcDate = localDateTimeToUtc('2026-09-05T00:30', tz);
    expect(nowUtcDate.toISOString()).toBe('2026-09-04T12:30:00.000Z');

    const deltaHours =
      (nowUtcDate.getTime() - doseUtcDate.getTime()) / (1000 * 60 * 60);
    expect(deltaHours).toBe(3.5);

    const active = activeCaffeineAt(doses, nowUtcDate.toISOString(), 5.0);
    const expected = Number((100 * Math.pow(2, -3.5 / 5.0)).toFixed(2));
    expect(active).toBe(expected);
  });

  it('resolves spring-forward DST gap times forward without throwing', () => {
    const tz = 'America/Los_Angeles';
    // 2026-03-08 02:00 springs forward to 03:00.
    // 02:30 local is inside the transition gap.
    expect(() => {
      const utcDate = localDateTimeToUtc('2026-03-08T02:30', tz);
      expect(utcDate).toBeInstanceOf(Date);
      expect(isNaN(utcDate.getTime())).toBe(false);
    }).not.toThrow();
  });
});
