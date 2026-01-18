import { BrowserMultiFormatReader, Result, NotFoundException } from '@zxing/library';
import { BarcodeScannerEngine } from './EngineInterface';

export class ZxingEngine implements BarcodeScannerEngine {
    private codeReader: BrowserMultiFormatReader;
    private videoElement: HTMLVideoElement | null = null;
    private containerElement: HTMLElement | null = null;
    private callback: ((code: string) => void) | null = null;
    private currentDeviceId: string | undefined = undefined;

    constructor() {
        this.codeReader = new BrowserMultiFormatReader();
    }

    init(element: HTMLElement) {
        this.containerElement = element;
    }

    async start(constraints: MediaStreamConstraints, deviceId?: string): Promise<void> {
        if (!this.containerElement) return;

        // Check if container IS a video element, or contains one
        if (this.containerElement instanceof HTMLVideoElement) {
            this.videoElement = this.containerElement;
        } else {
            // Look for existing video
            let video = this.containerElement.querySelector('video');
            if (!video) {
                // Create a video element if not found
                video = document.createElement('video');
                video.style.width = '100%';
                video.style.height = '100%';
                video.style.objectFit = 'cover';
                this.containerElement.appendChild(video);
            }
            this.videoElement = video;
        }

        this.currentDeviceId = deviceId;

        // Zxing allows passing deviceId directly to decodeFromVideoDevice
        // If deviceId is not provided, it will use the default or first available
        this.codeReader.decodeFromVideoDevice(this.currentDeviceId, this.videoElement, (result: Result | null, err: any) => {
            if (result) {
                const text = result.getText();
                if (this.callback) this.callback(text);
            } else if (err && !(err instanceof NotFoundException)) {
                console.error('Zxing scanning error:', err);
            }
        });
    }

    stop(): void {
        this.codeReader.reset();
    }

    onDetected(callback: (code: string) => void): void {
        this.callback = callback;
    }

    getMediaTrack(): MediaStreamTrack | null {
        if (this.videoElement && this.videoElement.srcObject) {
            const stream = this.videoElement.srcObject as MediaStream;
            return stream.getVideoTracks()[0] || null;
        }
        return null;
    }
}
