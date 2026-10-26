import { describe, expect, it } from 'vitest';
import {
  distanceToSegment,
  haversineMeters,
  localProjector,
  parseGpx,
  routeDistanceMeters,
  routeElevationGainMeters,
  routeOverlapFraction,
  routesAreDistinct,
  serializeGpx,
  simplifyRoute,
  type RoutePoint,
} from '@workspace/shared';
import { InvalidRouteError, prepareRoute } from '../utils/routePrep.js';

// ~111 m per 0.001 degree of latitude.
const line = (n: number): RoutePoint[] =>
  Array.from({ length: n }, (_, i) => ({ lat: 40 + i * 0.001, lon: -74 }));

describe('route geometry', () => {
  it('measures distance along the path', () => {
    expect(haversineMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBe(0);
    expect(routeDistanceMeters(line(11))).toBeGreaterThan(1100);
    expect(routeDistanceMeters(line(11))).toBeLessThan(1120);
  });

  it('ignores altitude wobble but counts real climbs', () => {
    const wobble = [0, 1, 0, 1, 0].map((alt) => ({ lat: 0, lon: 0, alt }));
    expect(routeElevationGainMeters(wobble)).toBe(0);
    const climb = [0, 5, 10, 20].map((alt) => ({ lat: 0, lon: 0, alt }));
    expect(routeElevationGainMeters(climb)).toBe(20);
    expect(routeElevationGainMeters(line(3))).toBeNull();
  });

  it('simplifies a straight line to its ends and caps the point count', () => {
    const straight = simplifyRoute(line(100), 2000);
    expect(straight.sourceIndexes).toEqual([0, 99]);
    const wiggly: RoutePoint[] = Array.from({ length: 5000 }, (_, i) => ({
      lat: 40 + i * 0.0001,
      lon: -74 + (i % 2) * 0.0003,
    }));
    expect(simplifyRoute(wiggly, 300).points.length).toBeLessThanOrEqual(300);
  });
});

describe('simplifyRoute work bound', () => {
  it('handles a 50,000-point zigzag quickly', () => {
    const zigzag: RoutePoint[] = Array.from({ length: 50000 }, (_, i) => ({
      lat: 40 + i * 0.0001,
      lon: -74 + (i % 2) * 0.0003,
    }));
    const started = Date.now();
    const result = simplifyRoute(zigzag, 2000);
    expect(result.points.length).toBeLessThanOrEqual(2000);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe('prepareRoute', () => {
  it('measures the full track and re-points cues at kept points', () => {
    const prepared = prepareRoute(line(100), [
      { index: 10, kind: 'left' },
      { index: 99, kind: 'arrive' },
    ]);
    expect(prepared.points).toHaveLength(2);
    expect(prepared.distanceM).toBeGreaterThan(10000);
    expect(prepared.cues.map((c) => c.index)).toEqual([0, 1]);
  });

  it('drops cues past the end of the track', () => {
    const prepared = prepareRoute(line(20), [{ index: 500, kind: 'left' }]);
    expect(prepared.cues).toEqual([]);
  });

  it('rejects tracks under 10 m', () => {
    expect(() => prepareRoute([line(1)[0], line(1)[0]])).toThrow(
      InvalidRouteError
    );
  });
});

describe('GPX', () => {
  const sample = `<?xml version="1.0"?>
<gpx version="1.1"><metadata><name>Meta</name></metadata>
<trk><name>Loop &amp; back</name><trkseg>
<trkpt lat="40.0" lon="-74.0"><ele>10.5</ele><time>2026-01-01T00:00:00Z</time></trkpt>
<trkpt lat="40.001" lon="-74.0"/>
<trkpt lat="95" lon="-74.0"><ele>1</ele></trkpt>
<trkpt lat="40.002" lon="-74.0"><ele>12</ele></trkpt>
</trkseg></trk></gpx>`;

  it('reads name, points and elevation, dropping invalid points', () => {
    const parsed = parseGpx(sample);
    expect(parsed.name).toBe('Loop & back');
    expect(parsed.points).toEqual([
      { lat: 40, lon: -74, alt: 10.5 },
      { lat: 40.001, lon: -74 },
      { lat: 40.002, lon: -74, alt: 12 },
    ]);
  });

  it('falls back to route points', () => {
    const parsed = parseGpx(
      '<gpx><rte><name>R</name><rtept lat="1" lon="2"/><rtept lat="1.1" lon="2"/></rte></gpx>'
    );
    expect(parsed.points).toHaveLength(2);
  });

  it('round-trips through serialize', () => {
    const points = parseGpx(sample).points;
    const again = parseGpx(serializeGpx('A <b>', points));
    expect(again.name).toBe('A <b>');
    expect(again.points).toEqual(points);
  });
});

describe('parseGpx work bound', () => {
  // Each input is a few MB of the kind of markup that makes a backtracking
  // expression quadratic. A linear scan finishes in milliseconds; the old
  // regular expression took seconds to minutes on these.
  const within = (ms: number, gpx: string): ReturnType<typeof parseGpx> => {
    const started = Date.now();
    const parsed = parseGpx(gpx);
    expect(Date.now() - started).toBeLessThan(ms);
    return parsed;
  };

  it('copes with many unclosed point tags', () => {
    const parsed = within(
      1500,
      '<gpx>' + '<trkpt lat="1" lon="1">'.repeat(150_000)
    );
    expect(parsed.points).toEqual([]);
  });

  it('copes with many point openers that never end', () => {
    expect(within(1500, '<trkpt '.repeat(300_000)).points).toEqual([]);
    expect(within(1500, '<rtept lat="1" '.repeat(150_000)).points).toEqual([]);
  });

  it('copes with many track and CDATA openers and no names', () => {
    expect(within(1500, '<trk '.repeat(400_000)).name).toBeNull();
    // An unclosed CDATA section is text to the end, so the name never closes.
    expect(
      within(1500, '<trk><name>' + '<![CDATA['.repeat(150_000) + '</name>').name
    ).toBeNull();
  });

  it('copes with many elevation openers inside one point', () => {
    const body = '<ele>'.repeat(200_000);
    const parsed = within(1500, `<trkpt lat="1" lon="2">${body}</trkpt>`);
    expect(parsed.points).toEqual([{ lat: 1, lon: 2 }]);
  });

  it('still reads a large well-formed file', () => {
    const pts = Array.from(
      { length: 100_000 },
      (_, i) =>
        `<trkpt lat="${40 + (i % 100) / 1000}" lon="-74"><ele>${i % 50}</ele></trkpt>`
    ).join('');
    const parsed = within(2000, `<gpx><trk><name>Big</name>${pts}</trk></gpx>`);
    expect(parsed.points).toHaveLength(100_000);
    expect(parsed.name).toBe('Big');
  });

  it('keeps reading points, names and elevation as before', () => {
    const parsed = parseGpx(
      `<gpx><metadata><name><![CDATA[Trail & <b>]]></name></metadata>
       <trk><trkseg>
         <trkpt lat="40" lon="-74"><ele>12.5</ele></trkpt>
         <trkpt lat='41' lon='-73'/>
         <trkpt lat="95" lon="1"/>
         <trkpt lat="42" lon="-72"><ele>99999</ele></trkpt>
       </trkseg></trk></gpx>`
    );
    expect(parsed.name).toBe('Trail & <b>');
    expect(parsed.points).toEqual([
      { lat: 40, lon: -74, alt: 12.5 },
      { lat: 41, lon: -73 },
      { lat: 42, lon: -72 },
    ]);
  });
});

describe('GPX comments, CDATA and control characters', () => {
  it('ignores point tags inside comments and CDATA', () => {
    const parsed = parseGpx(
      `<gpx><trk><name>Real</name>
        <!-- <trkpt lat="1" lon="1"/> <name>Hidden</name> -->
        <trkseg>
          <trkpt lat="40" lon="-74"/>
          <![CDATA[ <trkpt lat="2" lon="2"/> ]]>
          <trkpt lat="41" lon="-73"/>
        </trkseg></trk></gpx>`
    );
    expect(parsed.name).toBe('Real');
    expect(parsed.points).toEqual([
      { lat: 40, lon: -74 },
      { lat: 41, lon: -73 },
    ]);
  });

  it('does not read points from an unclosed comment or CDATA section', () => {
    expect(
      parseGpx('<trkpt lat="40" lon="-74"/><!-- <trkpt lat="1" lon="1"/>')
        .points
    ).toEqual([{ lat: 40, lon: -74 }]);
    expect(
      parseGpx('<trkpt lat="40" lon="-74"/><![CDATA[ <trkpt lat="1" lon="1"/>')
        .points
    ).toEqual([{ lat: 40, lon: -74 }]);
  });

  it('copes with many unclosed comments and CDATA openers', () => {
    const started = Date.now();
    parseGpx('<!--'.repeat(300_000));
    parseGpx('<![CDATA['.repeat(300_000) + '<trkpt lat="1" lon="1"/>');
    parseGpx('<trkpt lat="1" lon="1"/><![CDATA['.repeat(100_000));
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('writes a name without the characters XML 1.0 forbids', () => {
    const gpx = serializeGpx('Run\u0001 \u0008to\u000b￾\ud800 café 🏃', [
      { lat: 40, lon: -74 },
    ]);
    // eslint-disable-next-line no-control-regex
    expect(gpx).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
    expect(gpx).toContain('<name>Run to café 🏃</name>');
    expect(parseGpx(gpx).name).toBe('Run to café 🏃');
  });

  it('keeps tab and newline in a name', () => {
    expect(serializeGpx('a\tb\nc', [])).toContain('<name>a\tb\nc</name>');
  });
});

describe('GPX entities, attributes and numbers', () => {
  const nameOf = (name: string): string | null =>
    parseGpx(`<gpx><trk><name>${name}</name><trkseg>
      <trkpt lat="40" lon="-74"/><trkpt lat="40.01" lon="-74"/></trkseg></trk></gpx>`)
      .name;

  it('decodes each entity once', () => {
    expect(nameOf('a &amp;lt; b')).toBe('a &lt; b');
    expect(nameOf('Tom &amp; Jerry &lt;3 &quot;x&quot; &apos;y&apos;')).toBe(
      'Tom & Jerry <3 "x" \'y\''
    );
  });

  it('decodes numeric character references and drops forbidden ones', () => {
    expect(nameOf('Run &#38; walk &#x1F3C3; &#233;')).toBe('Run & walk 🏃 é');
    expect(nameOf('a&#1;b&#xD800;c&#0;')).toBe('abc');
  });

  it('leaves text in a CDATA section as it is', () => {
    expect(nameOf('<![CDATA[Fish &amp; chips &#233;]]>')).toBe(
      'Fish &amp; chips &#233;'
    );
  });

  it('treats a comment opener inside CDATA as text, not a comment', () => {
    const parsed = parseGpx(
      `<gpx><trk><name><![CDATA[<!-- not a comment]]></name><trkseg>
        <trkpt lat="40" lon="-74"/><trkpt lat="40.01" lon="-74"/>
      </trkseg></trk></gpx>`
    );
    expect(parsed.name).toBe('<!-- not a comment');
    expect(parsed.points).toHaveLength(2);
  });

  it('treats a CDATA opener inside a comment as text, not CDATA', () => {
    const parsed = parseGpx(
      `<gpx><!-- <![CDATA[ --><trk><trkseg>
        <trkpt lat="40" lon="-74"/><trkpt lat="40.01" lon="-74"/>
      </trkseg></trk></gpx>`
    );
    expect(parsed.points).toHaveLength(2);
  });

  it('reads lat and lon only as whole attribute names', () => {
    expect(
      parseGpx('<trkpt data-lat="1" xlat="2" lat="40" lon="-74"/>').points
    ).toEqual([{ lat: 40, lon: -74 }]);
    expect(parseGpx('<trkpt\n lat = "40"\n\tlon=\'-74\' />').points).toEqual([
      { lat: 40, lon: -74 },
    ]);
  });

  it('accepts only plain decimal numbers', () => {
    for (const bad of ['0x10', '1e1', 'Infinity', '', ' ', '1,5', '--1']) {
      expect(parseGpx(`<trkpt lat="${bad}" lon="5"/>`).points).toEqual([]);
    }
    expect(
      parseGpx('<trkpt lat=" 40.5 " lon="+5"><ele> 0x10 </ele></trkpt>').points
    ).toEqual([{ lat: 40.5, lon: 5 }]);
  });

  it('copes with many elevation openers before a single closer', () => {
    const started = Date.now();
    const parsed = parseGpx(
      `<trkpt lat="1" lon="2">${'<ele>'.repeat(200_000)}</ele></trkpt>`
    );
    expect(parsed.points).toEqual([{ lat: 1, lon: 2 }]);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('reads an elevation that follows a long run of openers', () => {
    expect(
      parseGpx(`<trkpt lat="1" lon="2">${'<ele>'.repeat(1000)}12</ele></trkpt>`)
        .points
    ).toEqual([{ lat: 1, lon: 2, alt: 12 }]);
  });
});

describe('simplifyRoute limits', () => {
  it('always keeps both ends, even when asked for fewer than two points', () => {
    for (const max of [0, 1, 2]) {
      const result = simplifyRoute(
        Array.from({ length: 50 }, (_, i) => ({
          lat: 40 + i * 0.001,
          lon: -74 + (i % 2) * 0.001,
        })),
        max
      );
      expect(result.sourceIndexes).toEqual([0, 49]);
    }
  });

  it('keeps the first and last of a closed loop and its far corners', () => {
    const loop: RoutePoint[] = [
      { lat: 40, lon: -74 },
      { lat: 40.01, lon: -74 },
      { lat: 40.01, lon: -73.99 },
      { lat: 40, lon: -73.99 },
      { lat: 40, lon: -74 },
    ];
    expect(simplifyRoute(loop, 100).sourceIndexes).toEqual([0, 1, 2, 3, 4]);
  });

  it('measures across the antimeridian and near a pole', () => {
    const across = haversineMeters(
      { lat: 0, lon: 179.9995 },
      { lat: 0, lon: -179.9995 }
    );
    expect(across).toBeGreaterThan(100);
    expect(across).toBeLessThan(120);
    const nearPole = routeDistanceMeters([
      { lat: 89.999, lon: 0 },
      { lat: 89.999, lon: 180 },
    ]);
    expect(nearPole).toBeLessThan(250);
  });
});

describe('parseGpx tag-end and elevation scans', () => {
  it('copes with many point openers and a single closing bracket', () => {
    const started = Date.now();
    expect(parseGpx('<trkpt '.repeat(300_000) + '>').points).toEqual([]);
    expect(parseGpx('<rtept lat="1" '.repeat(150_000) + '>').points).toEqual(
      []
    );
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('still reads a point whose tag follows many openers that never close', () => {
    expect(
      parseGpx('<trkpt '.repeat(1000) + '<trkpt lat="1" lon="2"/>').points
    ).toEqual([{ lat: 1, lon: 2 }]);
  });
});

describe('parseGpx at the largest accepted size', () => {
  it('stays fast on a 10 MB file of point openers with one closing bracket', () => {
    const started = Date.now();
    const shapes = [
      '<trkpt '.repeat(1_428_000) + '>',
      '<trkpt <rtept '.repeat(714_000) + '>',
      '<trkpt lat="1" lon="2">'.repeat(434_000),
    ];
    for (const gpx of shapes) expect(parseGpx(gpx).points).toEqual([]);
    expect(Date.now() - started).toBeLessThan(15_000);
  }, 60_000);

  it('finds the nearest spot on a segment in local metres', () => {
    const origin = { lat: 40, lon: -74 };
    const project = localProjector(origin);
    const a = project(origin);
    const b = project({ lat: 40.001, lon: -74 });
    const beside = project({ lat: 40.0005, lon: -73.9999 });
    const hit = distanceToSegment(beside, a, b);
    expect(hit.t).toBeCloseTo(0.5, 2);
    expect(hit.distance).toBeGreaterThan(8);
    expect(hit.distance).toBeLessThan(9.5);
    // Past either end the nearest spot is the end, and a zero-length segment is a point.
    expect(distanceToSegment(project({ lat: 40.002, lon: -74 }), a, b).t).toBe(
      1
    );
    expect(distanceToSegment(beside, a, a).t).toBe(0);
  });
});

// Bounds are far above the few tens of milliseconds measured in the sandbox so
// a slow CI runner does not flake, and far below the minutes an unbounded
// comparison takes on this input.
describe('route comparison on hostile input', () => {
  const pt = (lat: number, lon: number) => ({ lat, lon });

  it('compares two 50,000-point tracks in bounded time', () => {
    const a = Array.from({ length: 50_000 }, (_, i) =>
      pt(40 + i * 0.000004, -74 + Math.sin(i / 80) * 0.001)
    );
    const b = Array.from({ length: 50_000 }, (_, i) =>
      pt(40 + i * 0.000004, -74.0005 + Math.sin(i / 80) * 0.001)
    );
    const started = performance.now();
    const overlap = routeOverlapFraction(a, b);
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(overlap).toBeGreaterThanOrEqual(0);
    expect(overlap).toBeLessThanOrEqual(1);
  });

  it('compares a track that doubles back over one spot in bounded time', () => {
    // 50,000 points zigzagging inside a single 30 m cell: every sample lands
    // in the same bucket, which made the nearest-sample search quadratic.
    const zigzag = Array.from({ length: 50_000 }, (_, i) =>
      pt(40 + (i % 2) * 0.00005, -74 + (i % 3) * 0.00003)
    );
    const started = performance.now();
    const distinct = routesAreDistinct(zigzag, zigzag);
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(distinct).toBe(false);
  });
});
