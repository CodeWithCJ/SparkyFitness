import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { GpsTrackPoint } from '@workspace/shared';
import { buildGpx, gpxFileName } from '../utils/gpx';

/**
 * Writes GPX text to a file in the cache and opens the share sheet, so it can go
 * to Files, Strava, Garmin Connect or anywhere else. Resolves to false when the
 * person closed the sheet without choosing; other failures throw.
 */
export async function shareGpxFile(options: {
  xml: string;
  fileName: string;
  title: string;
}): Promise<boolean> {
  const file = new File(Paths.cache, options.fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(options.xml);
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/gpx+xml',
      UTI: 'com.topografix.gpx',
      dialogTitle: options.title,
    });
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && error.message?.includes('cancel')) {
      return false;
    }
    throw error;
  }
}

/** Shares a recorded activity's route as a GPX file. */
export function shareRouteAsGpx(options: {
  name: string;
  /** YYYY-MM-DD, for the file name. */
  day: string;
  description?: string;
  points: readonly GpsTrackPoint[];
}): Promise<boolean> {
  return shareGpxFile({
    xml: buildGpx({
      name: options.name,
      description: options.description,
      points: options.points,
    }),
    fileName: gpxFileName(options.name, options.day),
    title: options.name,
  });
}
