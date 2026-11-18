import { requireOptionalNativeModule } from 'expo';

/** The certificate the app holds: who it names and when it stops working. */
export interface ClientCertificateInfo {
  subject: string;
  /** Epoch milliseconds, or null where the platform cannot read it (iOS below 18). */
  expiresAt: number | null;
}

export type ClientCertificateImportError =
  /** The password does not open the file. */
  | 'wrongPassword'
  /** Not a PKCS#12 file this platform can read (or, on Android, a wrong password). */
  | 'invalidFile'
  /** The file holds a certificate but no private key. */
  | 'noPrivateKey'
  /** The device's key storage refused it. */
  | 'storage';

export type ClientCertificateImportResult =
  | { ok: true; info: ClientCertificateInfo }
  | { ok: false; error: ClientCertificateImportError };

/**
 * Request paths the certificate is wired into. False means this build cannot
 * present it there (a library changed under the native hook).
 */
export type ClientCertificateHookStatus = Partial<
  Record<'fetch' | 'images' | 'reactNative', boolean>
>;

export interface ClientCertificateNativeModule {
  /** Hosts (lowercase, no scheme or port) the certificate may be presented to. */
  setAllowedHosts(hosts: string[]): void;
  getCertificateInfo(): ClientCertificateInfo | null;
  removeCertificate(): void;
  getHookStatus(): ClientCertificateHookStatus;
  /** Reads a .p12/.pfx file. The password is used once and never stored. */
  importCertificate(
    fileUri: string,
    password: string
  ): Promise<ClientCertificateImportResult>;
}

// Null in a build made before this module existed, and in tests. Callers treat
// that as "client certificates are not available".
export default requireOptionalNativeModule<ClientCertificateNativeModule>(
  'ClientCertificate'
);
