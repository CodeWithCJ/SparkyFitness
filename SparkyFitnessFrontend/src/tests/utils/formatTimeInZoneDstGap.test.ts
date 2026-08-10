// The regression only manifests when the HOST zone has a DST spring-forward
// gap at the rendered wall clock, so pin the host zone before any Date math
// runs (Node re-reads process.env.TZ at each local-time computation).
const originalTz = process.env['TZ'];
process.env['TZ'] = 'America/New_York';

import { formatTimeInZone } from '@/utils/timeFormatters';

// Jest workers run several test files in one process, so the pinned zone
// must not leak into whichever suite this worker picks up next.
afterAll(() => {
  if (originalTz === undefined) {
    delete process.env['TZ'];
  } else {
    process.env['TZ'] = originalTz;
  }
});

// Issue #2033 review finding: rendering a record-zone wall clock by building
// a host-local Date normalizes nonexistent local times — New York turns
// 2024-03-10 02:30 into 03:30 — so sleep times whose record-zone wall clock
// lands inside the browser's spring-forward gap displayed an hour late.
describe('formatTimeInZone across the host DST gap', () => {
  it('renders an offset-zone wall clock that does not exist in the host zone', () => {
    // 07:30Z at -05:00 is 02:30 wall clock — inside New York's 02:00–03:00
    // gap on 2024-03-10.
    expect(
      formatTimeInZone(
        '2024-03-10T07:30:00Z',
        { kind: 'offset', minutes: -300 },
        'HH:mm'
      )
    ).toBe('02:30');
  });

  it('renders an IANA-zone wall clock that does not exist in the host zone', () => {
    // 2024-03-09T17:30Z is 02:30 on Mar 10 in Tokyo (no DST), which is still
    // a nonexistent local time for a New York host on that date.
    expect(
      formatTimeInZone(
        '2024-03-09T17:30:00Z',
        { kind: 'tz', tz: 'Asia/Tokyo' },
        'HH:mm'
      )
    ).toBe('02:30');
  });
});
