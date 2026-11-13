import {
  applyLibraryReport,
  buildRouteSync,
  routeRevision,
  watchRouteStatus,
  type WatchRouteRecord,
} from '../../src/utils/watchRouteSync';

const UPDATED = '2026-03-01T10:00:00.000Z';
const REV = Date.parse(UPDATED);
const route = { id: 'r1', updatedAt: UPDATED };
const empty: WatchRouteRecord = { sent: {}, reported: null, rejected: {} };

describe('routeRevision', () => {
  it('is the updatedAt in epoch ms, and 0 when unreadable', () => {
    expect(routeRevision(UPDATED)).toBe(REV);
    expect(routeRevision('not a date')).toBe(0);
  });
});

describe('watchRouteStatus', () => {
  it('is none for a route that was never sent', () => {
    expect(watchRouteStatus(route, empty)).toBe('none');
  });

  it('is pending once sent and until the watch reports it', () => {
    expect(watchRouteStatus(route, { ...empty, sent: { r1: REV } })).toBe(
      'pending'
    );
    expect(
      watchRouteStatus(route, {
        sent: { r1: REV },
        reported: { other: REV },
        rejected: {},
      })
    ).toBe('pending');
  });

  it('is onWatch when the watch reports this revision or a newer one', () => {
    const base = { sent: { r1: REV }, rejected: {} };
    expect(watchRouteStatus(route, { ...base, reported: { r1: REV } })).toBe(
      'onWatch'
    );
    expect(
      watchRouteStatus(route, { ...base, reported: { r1: REV + 1000 } })
    ).toBe('onWatch');
  });

  it('is onWatch from the report alone (a reinstalled phone app)', () => {
    expect(
      watchRouteStatus(route, { sent: {}, reported: { r1: REV }, rejected: {} })
    ).toBe('onWatch');
  });

  it('is outdated after the route is edited, and does not resend by itself', () => {
    const edited = { id: 'r1', updatedAt: '2026-03-02T10:00:00.000Z' };
    expect(
      watchRouteStatus(edited, {
        sent: { r1: REV },
        reported: { r1: REV },
        rejected: {},
      })
    ).toBe('outdated');
    expect(
      watchRouteStatus(edited, {
        sent: { r1: REV },
        reported: null,
        rejected: {},
      })
    ).toBe('outdated');
  });

  it('is pending when the edit was sent but the watch still holds the old copy', () => {
    const edited = { id: 'r1', updatedAt: '2026-03-02T10:00:00.000Z' };
    expect(
      watchRouteStatus(edited, {
        sent: { r1: Date.parse(edited.updatedAt) },
        reported: { r1: REV },
        rejected: {},
      })
    ).toBe('pending');
  });

  it('is full when the watch turned this revision away', () => {
    expect(
      watchRouteStatus(route, {
        sent: { r1: REV },
        reported: {},
        rejected: { r1: 'full' },
      })
    ).toBe('full');
  });
});

describe('buildRouteSync', () => {
  const points = [
    { lat: 51.5, lon: -0.12 },
    { lat: 51.501, lon: -0.12 },
    { lat: 51.501, lon: -0.118 },
  ];

  it('wraps the watch route payload with the revision', () => {
    const sync = buildRouteSync({
      id: 'r1',
      name: 'Loop',
      points,
      cues: [],
      updatedAt: UPDATED,
    });
    expect(sync?.updatedAt).toBe(REV);
    expect(sync?.route.id).toBe('r1');
    expect(sync?.route.name).toBe('Loop');
    // [lat, lon, ...] in millionths of a degree.
    expect(sync?.route.points.slice(0, 2)).toEqual([51_500_000, -120_000]);
    // Directions are derived when the route has none.
    expect(sync?.route.cues.length).toBeGreaterThan(0);
  });

  it('is null for a route with fewer than two points', () => {
    expect(
      buildRouteSync({
        id: 'r1',
        name: 'Dot',
        points: points.slice(0, 1),
        cues: [],
        updatedAt: UPDATED,
      })
    ).toBeNull();
  });
});

describe('applyLibraryReport', () => {
  it('replaces what the watch holds and what it turned away, keeping what was sent', () => {
    const next = applyLibraryReport(
      { sent: { r1: REV }, reported: { old: 1 }, rejected: { gone: 'full' } },
      {
        routes: [{ id: 'r1', updatedAt: REV }],
        rejected: [
          { id: 'r2', reason: 'full' },
          { id: 'r3', reason: 'storage' },
        ],
        capacity: 10,
        sentAt: 5,
      }
    );
    expect(next.sent).toEqual({ r1: REV });
    expect(next.reported).toEqual({ r1: REV });
    expect(next.rejected).toEqual({
      gone: 'full',
      r2: 'full',
      r3: 'storage',
    });
  });

  it('keeps a rejection a later report no longer carries, until the route is reported', () => {
    const record: WatchRouteRecord = {
      sent: { r1: REV, r2: REV },
      reported: {},
      rejected: { r1: 'full', r2: 'storage' },
    };
    const next = applyLibraryReport(record, {
      routes: [{ id: 'r2', updatedAt: REV }],
      rejected: [],
      capacity: 10,
      sentAt: 6,
    });
    expect(next.rejected).toEqual({ r1: 'full' });
  });
});
