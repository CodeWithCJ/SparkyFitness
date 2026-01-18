export interface BarcodeScannerEngine {
    /**
     * Initialize the engine with a container element.
     * The engine should calculate the best way to attach (append video, use existing, etc).
     */
    init(element: HTMLElement): void;

    /**
     * Start scanning with the provided constraints.
     * @param constraints MediaStreamConstraints
     * @param deviceId Optional specific device ID to use
     */
    start(constraints: MediaStreamConstraints, deviceId?: string): Promise<void>;

    /**
     * Stop scanning and release resources.
     */
    stop(): void;

    /**
     * Register a callback for detected barcodes.
     */
    onDetected(callback: (code: string) => void): void;

    /**
     * Optional: Get the active media stream track (for torch/focus).
     */
    getMediaTrack?(): MediaStreamTrack | null;
}
