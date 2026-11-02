import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { prepareLabelPhoto } from '../utils/labelPhoto';
import { addLog } from './LogService';

/** Reports are dense small print, so photos keep more resolution than labels. */
export const LAB_REPORT_PHOTO_MAX_DIMENSION = 2400;
/** The server rejects PDFs larger than this (about 15 MB). */
export const LAB_REPORT_MAX_PDF_BYTES = 14 * 1024 * 1024;

export type PickedLabReport =
  | { status: 'ok'; document: string; mimeType: string }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'too_large' }
  | { status: 'failed' };

/** Picks a PDF from Files and reads it as base64. */
export async function pickLabReportPdf(): Promise<PickedLabReport> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return { status: 'cancelled' };
    const asset = result.assets?.[0];
    if (!asset?.uri) return { status: 'cancelled' };
    // copyToCacheDirectory made a copy before any check, so every way out of
    // here removes it: platform cache cleanup is opportunistic, and repeated
    // oversized picks would otherwise pile up in cache storage.
    const file = new File(asset.uri);
    const discardCopy = () => {
      try {
        file.delete();
      } catch {
        // The cached copy is cleaned up with the cache; nothing depends on it.
      }
    };
    if (asset.size && asset.size > LAB_REPORT_MAX_PDF_BYTES) {
      discardCopy();
      return { status: 'too_large' };
    }
    try {
      const document = await file.base64();
      // A picker that reports no size is checked on what was read: base64 is
      // about 4/3 of the bytes.
      if (document.length > Math.ceil((LAB_REPORT_MAX_PDF_BYTES * 4) / 3)) {
        return { status: 'too_large' };
      }
      return { status: 'ok', document, mimeType: 'application/pdf' };
    } finally {
      discardCopy();
    }
  } catch (error) {
    addLog(`[Lab Report] PDF pick failed: ${String(error)}`, 'ERROR');
    return { status: 'failed' };
  }
}

async function fromImageResult(
  result: ImagePicker.ImagePickerResult
): Promise<PickedLabReport> {
  if (result.canceled) return { status: 'cancelled' };
  const asset = result.assets?.[0];
  if (!asset?.uri) return { status: 'cancelled' };
  const prepared = await prepareLabelPhoto(
    asset,
    LAB_REPORT_PHOTO_MAX_DIMENSION
  );
  return prepared
    ? { status: 'ok', document: prepared.base64, mimeType: 'image/jpeg' }
    : { status: 'failed' };
}

/** Picks a photo or screenshot of a report from the photo library. */
export async function pickLabReportFromLibrary(): Promise<PickedLabReport> {
  try {
    return await fromImageResult(
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        quality: 1,
      })
    );
  } catch (error) {
    addLog(`[Lab Report] Photo pick failed: ${String(error)}`, 'ERROR');
    return { status: 'failed' };
  }
}

/** Takes a photo of a printed report. */
export async function pickLabReportFromCamera(): Promise<PickedLabReport> {
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { status: 'denied' };
    return await fromImageResult(
      await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 1 })
    );
  } catch (error) {
    addLog(`[Lab Report] Camera failed: ${String(error)}`, 'ERROR');
    return { status: 'failed' };
  }
}
