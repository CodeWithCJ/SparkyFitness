import { describe, expect, it } from 'vitest';
import {
  MAX_ROUTE_MANEUVERS,
  MAX_ROUTE_POINTS,
  decodePolyline,
  mapValhallaLegs,
  maneuverTypeToCueKind,
} from '../services/routing/valhallaManeuvers.js';

/** Encodes points as a precision-6 polyline, mirroring Valhalla. */
function encode(points: Array<[number, number]>): string {
  let out = '';
  let prevLat = 0;
  let prevLon = 0;
  const enc = (value: number): string => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let chunk = '';
    while (v >= 0x20) {
      chunk += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return chunk + String.fromCharCode(v + 63);
  };
  for (const [lat, lon] of points) {
    const la = Math.round(lat * 1e6);
    const lo = Math.round(lon * 1e6);
    out += enc(la - prevLat) + enc(lo - prevLon);
    prevLat = la;
    prevLon = lo;
  }
  return out;
}

describe('maneuverTypeToCueKind', () => {
  it.each([
    [1, 'depart'],
    [3, 'depart'],
    [4, 'arrive'],
    [6, 'arrive'],
    [9, 'slight_right'],
    [10, 'right'],
    [11, 'sharp_right'],
    [12, 'uturn'],
    [13, 'uturn'],
    [14, 'sharp_left'],
    [15, 'left'],
    [16, 'slight_left'],
    [8, 'straight'],
    [26, 'straight'],
    [20, 'slight_right'],
    [21, 'slight_left'],
    [99, 'straight'],
  ])('maps type %i to %s', (type, kind) => {
    expect(maneuverTypeToCueKind(type)).toBe(kind);
  });

  it('drops type 0 (none)', () => {
    expect(maneuverTypeToCueKind(0)).toBeNull();
  });
});

describe('decodePolyline', () => {
  it('round-trips precision-6 coordinates', () => {
    const decoded = decodePolyline(
      encode([
        [40.123456, -74.654321],
        [40.124, -74.65],
        [-33.5, 151.25],
      ])
    );
    expect(decoded).toEqual([
      { lat: 40.123456, lon: -74.654321 },
      { lat: 40.124, lon: -74.65 },
      { lat: -33.5, lon: 151.25 },
    ]);
  });

  it('rejects a truncated polyline', () => {
    expect(() => decodePolyline('_')).toThrow(RangeError);
  });
});

describe('mapValhallaLegs', () => {
  const shape = encode([
    [40, -74],
    [40.001, -74],
    [40.001, -74.001],
    [40, -74.001],
  ]);

  it('maps maneuvers to cues with indexes, text and running distance', () => {
    const { points, cues } = mapValhallaLegs([
      {
        shape,
        maneuvers: [
          {
            type: 1,
            instruction: 'Walk north.',
            length: 0.111,
            begin_shape_index: 0,
          },
          {
            type: 15,
            instruction: 'Turn left.',
            length: 0.085,
            begin_shape_index: 1,
          },
          { type: 0, length: 0.01, begin_shape_index: 2 },
          {
            type: 4,
            instruction: 'You have arrived.',
            length: 0,
            begin_shape_index: 3,
          },
        ],
      },
    ]);
    expect(points).toHaveLength(4);
    expect(cues).toEqual([
      { index: 0, kind: 'depart', text: 'Walk north.', distanceM: 0 },
      { index: 1, kind: 'left', text: 'Turn left.', distanceM: 111 },
      { index: 3, kind: 'arrive', text: 'You have arrived.', distanceM: 206 },
    ]);
  });

  it('truncates long instruction text to the cue limit', () => {
    const { cues } = mapValhallaLegs([
      {
        shape,
        maneuvers: [
          { type: 10, instruction: 'x'.repeat(300), begin_shape_index: 1 },
        ],
      },
    ]);
    expect(cues[0].text).toHaveLength(120);
  });

  it('joins legs once and keeps only the first depart and last arrive', () => {
    const second = encode([
      [40, -74.001],
      [39.999, -74.001],
    ]);
    const { points, cues } = mapValhallaLegs([
      {
        shape,
        maneuvers: [
          { type: 1, length: 0.3, begin_shape_index: 0 },
          { type: 4, length: 0, begin_shape_index: 3 },
        ],
      },
      {
        shape: second,
        maneuvers: [
          { type: 1, length: 0.1, begin_shape_index: 0 },
          { type: 4, length: 0, begin_shape_index: 1 },
        ],
      },
    ]);
    expect(points).toHaveLength(5);
    expect(cues.map((c) => [c.kind, c.index])).toEqual([
      ['depart', 0],
      ['arrive', 4],
    ]);
    expect(cues[1].distanceM).toBe(400);
  });
});

describe('hostile engine answers', () => {
  // '??' is the pair (0, 0) deltas: two characters per point, so a few
  // megabytes of text would decode to millions of point objects.
  const bomb = (points: number) => '??'.repeat(points);

  it('refuses a polyline that decodes to more points than allowed, quickly', () => {
    const started = performance.now();
    expect(() => decodePolyline(bomb(3_000_000))).toThrow(RangeError);
    // A few milliseconds when measured; the bound is generous for CI.
    expect(performance.now() - started).toBeLessThan(5_000);
  });

  it('accepts a polyline at the limit', () => {
    expect(decodePolyline(bomb(MAX_ROUTE_POINTS))).toHaveLength(
      MAX_ROUTE_POINTS
    );
  });

  it('refuses an endless run of continuation bytes', () => {
    expect(() => decodePolyline('_'.repeat(5_000_000))).toThrow(RangeError);
  });

  it('counts points across legs, not per leg', () => {
    const leg = {
      shape: bomb(MAX_ROUTE_POINTS / 2 + 10),
      maneuvers: [{ type: 1, begin_shape_index: 0 }],
    };
    expect(() => mapValhallaLegs([leg, leg, leg])).toThrow(RangeError);
  });

  it('joins many large legs without spreading them into one call', () => {
    // Spreading 100,000 points into push() overflows the argument limit on
    // some engines; a loop does not.
    const leg = { shape: bomb(MAX_ROUTE_POINTS), maneuvers: [] };
    expect(mapValhallaLegs([leg]).points).toHaveLength(MAX_ROUTE_POINTS);
  });

  it('refuses more maneuvers than allowed', () => {
    const maneuvers = Array.from({ length: MAX_ROUTE_MANEUVERS + 1 }, () => ({
      type: 8,
      length: 0.001,
      begin_shape_index: 0,
    }));
    expect(() =>
      mapValhallaLegs([
        {
          shape: encode([
            [1, 1],
            [1.001, 1],
          ]),
          maneuvers,
        },
      ])
    ).toThrow(RangeError);
  });
});
