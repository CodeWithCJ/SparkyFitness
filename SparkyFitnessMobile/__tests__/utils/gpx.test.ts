import { buildGpx, gpxFileName } from '../../src/utils/gpx';

const point = (t: string, lat: number, lon: number, extra = {}) => ({
  t,
  lat,
  lon,
  ...extra,
});

describe('buildGpx', () => {
  it('writes a track with time, elevation and Garmin heart rate', () => {
    const xml = buildGpx({
      name: 'Outdoor run',
      points: [
        point('2026-10-13T07:00:05Z', 51.5, -0.12, { alt: 12.34, hr: 141.6 }),
        point('2026-10-13T07:00:00Z', 51.4999, -0.1201),
      ],
    });
    expect(xml).toContain('<gpx version="1.1" creator="SparkyFitness"');
    expect(xml).toContain('<name>Outdoor run</name>');
    // Oldest first, whatever order they came in.
    expect(xml.indexOf('07:00:00')).toBeLessThan(xml.indexOf('07:00:05'));
    expect(xml).toContain('<trkpt lat="51.5" lon="-0.12">');
    expect(xml).toContain('<ele>12.3</ele>');
    expect(xml).toContain('<gpxtpx:hr>142</gpxtpx:hr>');
    expect(xml).toContain('<time>2026-10-13T07:00:00.000Z</time>');
  });

  it('escapes the name and leaves out unreadable points', () => {
    const xml = buildGpx({
      name: 'Tom & "Jerry" <5k>',
      description: "it's easy",
      points: [
        point('not a date', 1, 1),
        point('2026-10-13T07:00:00Z', 95, 0),
        point('2026-10-13T07:00:00Z', 10, 20),
      ],
    });
    expect(xml).toContain('Tom &amp; &quot;Jerry&quot; &lt;5k&gt;');
    expect(xml).toContain('<desc>it&apos;s easy</desc>');
    expect(xml.match(/<trkpt /g)).toHaveLength(1);
  });

  it('writes an empty track without a time when nothing is usable', () => {
    const xml = buildGpx({ name: 'Nothing', points: [] });
    expect(xml).not.toContain('<trkpt');
    expect(xml).toContain('<metadata><name>Nothing</name></metadata>');
  });
});

describe('gpxFileName', () => {
  it('makes a safe name with the day', () => {
    expect(gpxFileName('Outdoor Run / 5K!', '2026-10-13')).toBe(
      'outdoor-run-5k-2026-10-13.gpx'
    );
    expect(gpxFileName('???', '')).toBe('activity.gpx');
  });
});
