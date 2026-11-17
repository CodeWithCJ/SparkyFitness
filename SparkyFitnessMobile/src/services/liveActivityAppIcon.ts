import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';

/**
 * Copies the small Live Activity icon into the shared app group container,
 * where the widget process can read it, and returns its file:// URI (null on
 * Android or any failure; the layouts then fall back to an SF symbol).
 * WidgetKit rejects oversized Live Activity images, so the full-resolution
 * icon art cannot be used. Overwrites, so an icon change ships with the next
 * app update.
 */
export async function copyLiveActivityIcon(
  fileName: string
): Promise<string | null> {
  const container = Object.values(Paths.appleSharedContainers)[0];
  if (container == null) return null;
  const asset = Asset.fromModule(
    require('../../assets/icons/live-activity-icon.png')
  );
  await asset.downloadAsync();
  if (asset.localUri == null) return null;
  const destination = new File(container, fileName);
  if (destination.exists) destination.delete();
  new File(asset.localUri).copy(destination);
  return destination.uri;
}
