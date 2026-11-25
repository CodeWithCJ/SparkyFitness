import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  exportComplications,
  type WatchComplicationDefinition,
} from '../utils/watchComplications';

const FILE_NAME = 'sparkyfitness-watch-complications.json';

/** A list of complications is a few KB; anything this big is not one. */
const MAX_IMPORT_BYTES = 256 * 1024;

export class ComplicationFileTooLargeError extends Error {}

/**
 * Writes the list to a file in the cache and opens the share sheet, so it can
 * go to Files, AirDrop or a message. Resolves to false when the person closed
 * the sheet without choosing; other failures throw.
 */
export async function shareComplicationsFile(
  list: readonly WatchComplicationDefinition[]
): Promise<boolean> {
  const file = new File(Paths.cache, FILE_NAME);
  if (file.exists) file.delete();
  file.create();
  file.write(exportComplications(list));
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: FILE_NAME,
    });
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && error.message?.includes('cancel')) {
      return false;
    }
    throw error;
  }
}

/**
 * Lets the person pick an exported file and returns its text, or null when they
 * close the picker without choosing. Does not check the contents: that is
 * `parseComplicationsImport`'s job.
 */
export async function pickComplicationsFile(): Promise<string | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = picked.canceled ? undefined : picked.assets[0];
  if (!asset) return null;
  const copy = new File(asset.uri);
  try {
    if (asset.size !== undefined && asset.size > MAX_IMPORT_BYTES) {
      throw new ComplicationFileTooLargeError();
    }
    const text = await copy.text();
    if (text.length > MAX_IMPORT_BYTES)
      throw new ComplicationFileTooLargeError();
    return text;
  } finally {
    // The picker copied the file into the cache; it is not needed afterwards.
    try {
      copy.delete();
    } catch {
      // Already gone, or not ours to delete.
    }
  }
}
