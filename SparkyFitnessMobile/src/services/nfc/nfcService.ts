import { Platform } from 'react-native';
import { getRandomBytes } from 'expo-crypto';
import NfcManager, { Ndef, NfcTech } from 'react-native-nfc-manager';
import { actionTagUrl, tagCodeFromUrl } from '@workspace/shared';
import { addLog } from '../LogService';

/** 128 random bits as lowercase hex: the code a tag link carries. */
export function generateTagCode(): string {
  return Array.from(getRandomBytes(16), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

let started = false;

// Android: read through the app's own reader mode, not the system's tag
// dispatch. Dispatch also hands a web-link tag to the browser (Android 16 and
// later always do), so a scan inside the app would open the site as well.
// Reader mode keeps the tag to this app while it waits, with no browser and no
// extra prompt. The flags name the tag types to read (NFC-A, B, F and V); the
// library's default of 0 would match none.
const NFC_READER_FLAGS = 1 | 2 | 4 | 8;
function sessionOptions(alertMessage: string) {
  return Platform.OS === 'android'
    ? {
        alertMessage,
        isReaderModeEnabled: true,
        readerModeFlags: NFC_READER_FLAGS,
      }
    : { alertMessage };
}

async function ensureStarted(): Promise<void> {
  if (started) return;
  await NfcManager.start();
  started = true;
}

/** False on a phone without NFC, and when the library cannot start. */
export async function isNfcSupported(): Promise<boolean> {
  try {
    const supported = await NfcManager.isSupported();
    if (supported) await ensureStarted();
    return supported;
  } catch (error) {
    addLog(`[NFC] Support check failed: ${String(error)}`, 'WARNING');
    return false;
  }
}

/** NFC can be switched off in Android's settings. iOS has no such switch. */
export async function isNfcEnabled(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    return await NfcManager.isEnabled();
  } catch {
    return false;
  }
}

export type TagContents =
  | { kind: 'empty' }
  /** One of our links; `code` is its tag code. */
  | { kind: 'sparky'; code: string }
  /** Something else is already written on the sticker. */
  | { kind: 'other' };

export type ReadTagResult =
  | { status: 'read'; contents: TagContents }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export type WriteTagResult =
  | { status: 'written' }
  /** The sticker already holds data; ask before overwriting (`overwrite: true`). */
  | { status: 'has_data'; contents: Exclude<TagContents, { kind: 'empty' }> }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

function isCancellation(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error);
  return /cancel/i.test(message);
}

function describeContents(
  records:
    | readonly { tnf: number; type: number[] | string; payload: number[] }[]
    | null
): TagContents {
  if (!records || records.length === 0) return { kind: 'empty' };
  for (const record of records) {
    if (!Ndef.isType(record as never, Ndef.TNF_WELL_KNOWN, Ndef.RTD_URI)) {
      continue;
    }
    const url = Ndef.uri.decodePayload(Uint8Array.from(record.payload));
    const code = tagCodeFromUrl(url);
    if (code) return { kind: 'sparky', code };
  }
  // A blank sticker often reports one empty record.
  const onlyEmpty = records.every(
    (record) => record.tnf === Ndef.TNF_EMPTY || record.payload.length === 0
  );
  return onlyEmpty ? { kind: 'empty' } : { kind: 'other' };
}

// The read or write in progress, from the moment it starts until its final
// cleanup. The native API has no request identity, so an older request's
// cleanup must not cancel a newer one; each cleanup checks it still owns this.
type ActiveRequest = { cancelled: boolean };
let activeRequest: ActiveRequest | null = null;

const CANCEL_RETRY_MS = 100;
const CANCEL_RETRIES = 10;

/**
 * Stops a read or write that is still waiting for a tag (the Cancel button, or
 * leaving the screen). A cancel can arrive before the native request exists,
 * since the library registers for tag events first, and then finds nothing to
 * cancel. So it tries again until the request has ended, and a request that is
 * still starting does not go ahead.
 */
export async function cancelNfcRequest(): Promise<void> {
  const request = activeRequest;
  if (request) request.cancelled = true;
  await releaseSession();
  for (let i = 0; request && i < CANCEL_RETRIES; i++) {
    if (activeRequest !== request) return;
    await new Promise((resolve) => setTimeout(resolve, CANCEL_RETRY_MS));
    if (activeRequest === request) await releaseSession();
  }
}

async function releaseSession(request?: ActiveRequest): Promise<void> {
  // A request that has since been replaced must not cancel its successor.
  if (request && activeRequest !== request) return;
  try {
    await NfcManager.cancelTechnologyRequest();
  } catch {
    // Nothing to release.
  }
}

async function waitForTag(
  alertMessage: string,
  request: ActiveRequest
): Promise<void> {
  activeRequest = request;
  await ensureStarted();
  if (request.cancelled) throw new Error('NFC request cancelled');
  await NfcManager.requestTechnology(
    NfcTech.Ndef,
    sessionOptions(alertMessage)
  );
}

/**
 * Holds the phone to a sticker and reports what it carries. Used by the Scan
 * button, for when tapping the sticker does not open the app by itself.
 */
export async function readTag(alertMessage: string): Promise<ReadTagResult> {
  const request: ActiveRequest = { cancelled: false };
  try {
    await waitForTag(alertMessage, request);
    const tag = await NfcManager.getTag();
    return {
      status: 'read',
      contents: describeContents(tag?.ndefMessage ?? null),
    };
  } catch (error) {
    if (isCancellation(error)) return { status: 'cancelled' };
    addLog(`[NFC] Read failed: ${String(error)}`, 'WARNING');
    return { status: 'error', message: String(error) };
  } finally {
    await releaseSession(request);
    if (activeRequest === request) activeRequest = null;
  }
}

/**
 * Writes the tag link for `code`. A sticker that already holds something is
 * left alone until the caller asks again with `overwrite: true`, so a
 * hotel key card or someone else's sticker is never wiped by accident.
 */
export async function writeTag(
  code: string,
  options: {
    alertMessage: string;
    successMessage?: string;
    overwrite?: boolean;
  }
): Promise<WriteTagResult> {
  const request: ActiveRequest = { cancelled: false };
  try {
    await waitForTag(options.alertMessage, request);
    const existing = await NfcManager.getTag();
    const contents = describeContents(existing?.ndefMessage ?? null);
    if (contents.kind !== 'empty' && !options.overwrite) {
      return { status: 'has_data', contents };
    }
    const bytes = Ndef.encodeMessage([Ndef.uriRecord(actionTagUrl(code))]);
    await NfcManager.ndefHandler.writeNdefMessage(bytes);
    if (Platform.OS === 'ios' && options.successMessage) {
      await NfcManager.setAlertMessageIOS(options.successMessage);
    }
    return { status: 'written' };
  } catch (error) {
    if (isCancellation(error)) return { status: 'cancelled' };
    addLog(`[NFC] Write failed: ${String(error)}`, 'WARNING');
    return { status: 'error', message: String(error) };
  } finally {
    await releaseSession(request);
    if (activeRequest === request) activeRequest = null;
  }
}
