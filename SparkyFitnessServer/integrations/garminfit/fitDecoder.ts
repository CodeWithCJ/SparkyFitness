import { Decoder, Stream } from '@garmin/fitsdk';
import type { FitMessages } from '@garmin/fitsdk';

export interface FitDecodeResult {
  isFit: boolean;
  integrityOk: boolean;
  messages: FitMessages | null;
  errors: string[];
}

/**
 * Decodes a FIT file buffer with Garmin's official SDK.
 *
 * Integrity (CRC) failures are surfaced but do not block decoding: activity
 * files truncated by a device crash are still recoverable, matching Garmin's
 * own guidance for activity imports.
 */
function decodeFitBuffer(buffer: Buffer): FitDecodeResult {
  const stream = Stream.fromBuffer(buffer);
  const decoder = new Decoder(stream);
  if (!decoder.isFIT()) {
    return {
      isFit: false,
      integrityOk: false,
      messages: null,
      errors: ['Not a FIT file.'],
    };
  }
  const integrityOk = decoder.checkIntegrity();
  try {
    const { messages, errors } = decoder.read();
    return {
      isFit: true,
      integrityOk,
      messages,
      errors: errors.map((error) =>
        error instanceof Error ? error.message : String(error)
      ),
    };
  } catch (error) {
    return {
      isFit: true,
      integrityOk,
      messages: null,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export { decodeFitBuffer };
export default { decodeFitBuffer };
