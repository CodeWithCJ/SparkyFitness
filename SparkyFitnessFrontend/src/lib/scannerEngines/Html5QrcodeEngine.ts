import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import type { BarcodeScannerEngine } from './EngineInterface';

export class Html5QrcodeEngine implements BarcodeScannerEngine {
  private html5QrCode: Html5Qrcode | null = null;
  private containerElement: HTMLElement | null = null;
  private callback: ((code: string) => void) | null = null;
  private isScanning = false;

  init(element: HTMLElement) {
    this.containerElement = element;
    // Html5Qrcode requires an ID. Ensure it has one.
    if (!this.containerElement.id) {
      this.containerElement.id =
        'html5-qrcode-reader-' + Math.random().toString(36).substr(2, 9);
    }
  }

  async start(
    constraints: MediaStreamConstraints,
    deviceId?: string
  ): Promise<void> {
    if (!this.containerElement) return;

    // Use element ID
    this.html5QrCode = new Html5Qrcode(this.containerElement.id);
    this.isScanning = true;

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      // Removed fixedAspectRatio to allow library to determine best fit or fill container
      // aspectRatio: 1.0,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
      ],
    };

    // Determine camera to use
    let cameraIdOrConfig: string | object;

    if (deviceId) {
      cameraIdOrConfig = { deviceId: { exact: deviceId } };
    } else {
      const facingMode = (constraints.video as MediaTrackConstraints)
        ?.facingMode;
      cameraIdOrConfig =
        facingMode === 'user'
          ? { facingMode: 'user' }
          : { facingMode: 'environment' };
    }

    try {
      await this.html5QrCode.start(
        cameraIdOrConfig,
        config,
        (decodedText) => {
          if (this.callback) this.callback(decodedText);
        },
        (_errorMessage) => {
          // parse error, ignore it.
        }
      );
    } catch (err) {
      console.error('Error starting html5-qrcode:', err);
      this.isScanning = false;
      // cleanup if failed start
      this.html5QrCode.clear();
      throw err;
    }
  }

  stop(): void {
    if (this.html5QrCode && this.isScanning) {
      this.isScanning = false;
      try {
        this.html5QrCode
          .stop()
          .then(() => {
            return this.html5QrCode?.clear();
          })
          .catch((err) => {
            // Ignore errors during stop/clear as they often happen during unmount
            console.debug('Html5Qrcode stop/clear error (ignored):', err);
          });
      } catch (e) {
        console.debug('Html5Qrcode stop sync error:', e);
      }
    }
  }

  onDetected(callback: (code: string) => void): void {
    this.callback = callback;
  }
}
