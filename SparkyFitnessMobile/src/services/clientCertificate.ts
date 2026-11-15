import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import ClientCertificateModule, {
  type ClientCertificateImportResult,
  type ClientCertificateInfo,
} from '../../modules/client-certificate';
import { extractHost } from '../utils/serverUrl';
import { addLog } from './LogService';
import { getSavedServerUrls } from './storage';

export type {
  ClientCertificateImportError,
  ClientCertificateInfo,
} from '../../modules/client-certificate';

// The TLS client certificate for a server behind a reverse proxy that requires
// mutual TLS (#123). One certificate for the whole app, held by the native
// module (modules/client-certificate), which presents it on every request path
// but only to the hosts listed here: the saved servers, plus the server being
// connected to before it is saved.

/** A certificate this close to its end is flagged so it can be replaced in time. */
export const CLIENT_CERTIFICATE_EXPIRY_WARNING_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ClientCertificateExpiry = 'valid' | 'expiring' | 'expired';

export const clientCertificateExpiry = (
  info: ClientCertificateInfo,
  now: number = Date.now()
): ClientCertificateExpiry | null => {
  if (info.expiresAt == null) return null;
  if (info.expiresAt <= now) return 'expired';
  if (info.expiresAt - now <= CLIENT_CERTIFICATE_EXPIRY_WARNING_DAYS * DAY_MS) {
    return 'expiring';
  }
  return 'valid';
};

/** False in a build made before the native module existed. */
export const isClientCertificateSupported = (): boolean =>
  ClientCertificateModule != null;

/** The distinct hosts of these server URLs; URLs with no host are dropped. */
export const hostsForServerUrls = (
  urls: readonly (string | null | undefined)[]
): string[] => {
  const hosts = new Set<string>();
  for (const url of urls) {
    const host = url ? extractHost(url) : '';
    if (host) hosts.add(host);
  }
  return [...hosts].sort();
};

let pendingServerUrl: string | null = null;
let lastSentHosts: string | null = null;
let refreshQueue: Promise<void> = Promise.resolve();

/**
 * Tells the native module which hosts may be shown the certificate: every
 * saved server and the pending one. Call after the saved list changes.
 */
export const refreshClientCertificateHosts = (): Promise<void> => {
  // One at a time: two overlapping refreshes could otherwise finish out of
  // order and leave the native side with the older list, dropping a server
  // that was just saved. Never rejects, so callers can fire and forget.
  const next = refreshQueue.then(sendClientCertificateHosts);
  refreshQueue = next;
  return next;
};

const sendClientCertificateHosts = async (): Promise<void> => {
  if (!ClientCertificateModule) return;
  try {
    const savedUrls = await getSavedServerUrls();
    const hosts = hostsForServerUrls([...savedUrls, pendingServerUrl]);
    const key = hosts.join('\n');
    if (key === lastSentHosts) return;
    ClientCertificateModule.setAllowedHosts(hosts);
    lastSentHosts = key;
    // Counts only: exported logs must not carry the user's server names.
    addLog(
      `[ClientCertificate] Allowed hosts updated (${hosts.length}; saved servers: ${savedUrls.length}${pendingServerUrl ? ', one pending' : ''})`,
      'INFO'
    );
  } catch (error) {
    // Keep the list the native side already has. A failed read must not be
    // taken for "no servers", which would stop the certificate being sent.
    addLog(
      `[ClientCertificate] Could not update allowed hosts: ${String(error)}`,
      'WARNING'
    );
  }
};

/**
 * The server a connection is about to be tested against, before it is saved
 * (onboarding, the add-server form). Pass null when that form closes. Await it
 * before the first request, or the handshake runs without the certificate.
 */
export const setPendingClientCertificateServer = async (
  url: string | null
): Promise<void> => {
  pendingServerUrl = url?.trim() ? url : null;
  // Always re-sync, even for the same address: the first attempt may have
  // failed to read the saved list, and a second caller must wait for the sync
  // already running instead of returning before it ends. Nothing is sent to
  // the native side when the list has not changed.
  await refreshClientCertificateHosts();
};

export const getClientCertificateInfo = (): ClientCertificateInfo | null => {
  try {
    return ClientCertificateModule?.getCertificateInfo() ?? null;
  } catch (error) {
    addLog(
      `[ClientCertificate] Failed to read the certificate: ${String(error)}`,
      'ERROR'
    );
    return null;
  }
};

/**
 * True when a failed connection may be a server asking for a certificate the
 * app does not have, so the error can point at where to add one.
 */
export const shouldSuggestClientCertificate = (): boolean =>
  isClientCertificateSupported() && getClientCertificateInfo() == null;

/**
 * True when this build cannot present the certificate on one of its request
 * paths, so a stored certificate would not work everywhere.
 */
export const hasClientCertificateGap = (): boolean => {
  try {
    const status = ClientCertificateModule?.getHookStatus() ?? {};
    return status.fetch === false || status.images === false;
  } catch {
    return false;
  }
};

export const removeClientCertificate = (): void => {
  ClientCertificateModule?.removeCertificate();
};

const discardFile = (uri: string): void => {
  try {
    new File(uri).delete();
  } catch {
    // The cached copy is cleaned up with the cache; nothing depends on it.
  }
};

export interface PickedClientCertificateFile {
  uri: string;
  name: string;
}

/**
 * Lets the user choose a .p12/.pfx file. The picker copies it into the app's
 * cache; `importClientCertificate` or `discardClientCertificateFile` removes
 * that copy. Null when cancelled.
 */
export const pickClientCertificateFile =
  async (): Promise<PickedClientCertificateFile | null> => {
    // Any type: .p12 and .pfx have no reliable type on either platform, and a
    // wrong file is reported by the import.
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return null;
    const asset = result.assets?.[0];
    if (!asset?.uri) return null;
    return { uri: asset.uri, name: asset.name };
  };

export const discardClientCertificateFile = (
  file: PickedClientCertificateFile
): void => discardFile(file.uri);

/**
 * Stores the certificate from a picked file. The cached copy is removed once
 * it is stored; after a failure it is kept so the password can be retried.
 */
export const importClientCertificate = async (
  file: PickedClientCertificateFile,
  password: string
): Promise<ClientCertificateImportResult> => {
  if (!ClientCertificateModule) return { ok: false, error: 'storage' };
  let result: ClientCertificateImportResult;
  try {
    result = await ClientCertificateModule.importCertificate(
      file.uri,
      password
    );
  } catch (error) {
    addLog(`[ClientCertificate] Import failed: ${String(error)}`, 'ERROR');
    result = { ok: false, error: 'invalidFile' };
  }
  if (result.ok) {
    discardFile(file.uri);
    // An upgrade from a build without this module has saved servers the
    // native side has never been told about.
    await refreshClientCertificateHosts();
  }
  return result;
};
