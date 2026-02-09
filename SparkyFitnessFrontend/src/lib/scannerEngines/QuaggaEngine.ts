import Quagga from '@ericblade/quagga2';
import type { BarcodeScannerEngine } from './EngineInterface';

export class QuaggaEngine implements BarcodeScannerEngine {
    private containerElement: HTMLElement | null = null;
    private callback: ((code: string) => void) | null = null;
    private isScanning = false;

    init(element: HTMLElement) {
        this.containerElement = element;
    }

    async start(constraints: MediaStreamConstraints, deviceId?: string): Promise<void> {
        if (!this.containerElement) return;

        this.isScanning = true;

        const liveStreamConfig: any = {
            type: "LiveStream",
            target: this.containerElement!,
        };

        if (deviceId) {
            liveStreamConfig.constraints = {
                deviceId: { exact: deviceId }
            };
        } else {
            const facingMode = (constraints.video as MediaTrackConstraints)?.facingMode;
            const actualFacingMode = (facingMode === 'user') ? 'user' : 'environment';
            liveStreamConfig.constraints = {
                facingMode: actualFacingMode,
            };
        }

        return new Promise((resolve, reject) => {
            Quagga.init({
                inputStream: liveStreamConfig,
                decoder: {
                    readers: ["ean_reader", "upc_reader", "code_128_reader", "code_39_reader"]
                },
                locate: true,
            }, (err) => {
                if (err) {
                    console.error("Error starting Quagga:", err);
                    this.isScanning = false;
                    reject(err);
                    return;
                }
                Quagga.start();
                resolve();
            });

            Quagga.onDetected((result) => {
                if (this.callback && result.codeResult && result.codeResult.code) {
                    this.callback(result.codeResult.code);
                }
            });
        });
    }

    stop(): void {
        if (this.isScanning) {
            Quagga.stop();
            this.isScanning = false;
        }
    }

    onDetected(callback: (code: string) => void): void {
        this.callback = callback;
    }
}
