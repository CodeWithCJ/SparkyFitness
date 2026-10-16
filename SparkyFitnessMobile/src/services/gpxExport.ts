import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { GpsTrackPoint } from '@workspace/shared';
import { buildGpx, gpxFileName } from '../utils/gpx';

/**
 * Writes the route to a GPX file and opens the share sheet, so it can go to
 * Files, Strava, Garmin Connect or anywhere else. Resolves to false when the
 * person closed the sheet without choosing; other failures throw.
 */
export async function shareRouteAsGpx(options: {
  name: string;
  /** YYYY-MM-DD, for the file name. */
  day: string;
  description?: string;
  points: readonly GpsTrackPoint[];
}): Promise<boolean> {
  const xml = buildGpx({
    name: options.name,
    description: options.description,
    points: options.points,
  });
  const file = new File(Paths.cache, gpxFileName(options.name, options.day));
  if (file.exists) file.delete();
  file.create();
  file.write(xml);
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/gpx+xml',
      UTI: 'com.topografix.gpx',
      dialogTitle: options.name,
    });
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && error.message?.includes('cancel')) {
      return false;
    }
    throw error;
  }
}
