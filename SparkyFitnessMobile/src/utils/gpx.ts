import type { GpsTrackPoint } from '@workspace/shared';

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** Whole numbers stay whole; fractions are cut to what a GPS can tell. */
const num = (value: number, digits: number): string =>
  String(Number(value.toFixed(digits)));

/**
 * A GPX 1.1 file for one recorded route, which Strava, Garmin Connect,
 * Komoot and most other apps read. Points are put in time order; each
 * carries its elevation, time and (when recorded) heart rate and cadence as
 * Garmin's TrackPointExtension. Points with an unreadable time or position
 * are left out.
 */
export function buildGpx(options: {
  name: string;
  /** Free text under the track, e.g. the activity. */
  description?: string;
  points: readonly GpsTrackPoint[];
}): string {
  const points = options.points
    .map((point) => ({ point, at: Date.parse(point.t) }))
    .filter(
      ({ point, at }) =>
        Number.isFinite(at) &&
        Number.isFinite(point.lat) &&
        Number.isFinite(point.lon) &&
        Math.abs(point.lat) <= 90 &&
        Math.abs(point.lon) <= 180
    )
    .sort((a, b) => a.at - b.at);

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<gpx version="1.1" creator="SparkyFitness" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">'
  );
  if (points.length > 0) {
    lines.push(
      `  <metadata><name>${escapeXml(options.name)}</name><time>${new Date(points[0].at).toISOString()}</time></metadata>`
    );
  } else {
    lines.push(
      `  <metadata><name>${escapeXml(options.name)}</name></metadata>`
    );
  }
  lines.push('  <trk>');
  lines.push(`    <name>${escapeXml(options.name)}</name>`);
  if (options.description) {
    lines.push(`    <desc>${escapeXml(options.description)}</desc>`);
  }
  lines.push('    <trkseg>');
  for (const { point, at } of points) {
    lines.push(
      `      <trkpt lat="${num(point.lat, 7)}" lon="${num(point.lon, 7)}">`
    );
    if (typeof point.alt === 'number' && Number.isFinite(point.alt)) {
      lines.push(`        <ele>${num(point.alt, 1)}</ele>`);
    }
    lines.push(`        <time>${new Date(at).toISOString()}</time>`);
    const hr =
      typeof point.hr === 'number' && point.hr > 0
        ? Math.round(point.hr)
        : null;
    const cad =
      typeof point.cad === 'number' && point.cad > 0
        ? Math.round(point.cad)
        : null;
    if (hr !== null || cad !== null) {
      lines.push('        <extensions><gpxtpx:TrackPointExtension>');
      if (hr !== null) lines.push(`          <gpxtpx:hr>${hr}</gpxtpx:hr>`);
      if (cad !== null) lines.push(`          <gpxtpx:cad>${cad}</gpxtpx:cad>`);
      lines.push('        </gpxtpx:TrackPointExtension></extensions>');
    }
    lines.push('      </trkpt>');
  }
  lines.push('    </trkseg>');
  lines.push('  </trk>');
  lines.push('</gpx>');
  return lines.join('\n') + '\n';
}

/** A file name safe on every platform: "Outdoor Run 2026-10-13" → "outdoor-run-2026-10-13.gpx". */
export function gpxFileName(name: string, day: string): string {
  const slug = `${name} ${day}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'activity'}.gpx`;
}
