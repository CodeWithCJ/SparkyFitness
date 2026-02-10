// BarcodeScanner component with selectable scanning engine and camera switching
import type React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Scan,
  Camera,
  Flashlight,
  FlashlightOff,
  Keyboard,
  RefreshCcw,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import type { BarcodeScannerEngine } from '@/lib/scannerEngines/EngineInterface';
import { ZxingEngine } from '@/lib/scannerEngines/ZxingEngine';
import { Html5QrcodeEngine } from '@/lib/scannerEngines/Html5QrcodeEngine';
import { QuaggaEngine } from '@/lib/scannerEngines/QuaggaEngine';

interface BarcodeScannerProps {
  onBarcodeDetected: (barcode: string) => void;
  onClose: () => void;
  isActive: boolean;
  cameraFacing: 'front' | 'back';
}

const ENGINE_OPTIONS = [
  { value: 'zxing', label: '@zxing/library' },
  { value: 'html5-qrcode', label: 'html5-qrcode' },
  { value: 'quagga2', label: 'quagga2' },
];

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onBarcodeDetected,
  onClose,
  isActive,
  cameraFacing,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Engines
  const [selectedEngine, setSelectedEngine] = useState<string>(() => {
    try {
      const stored = localStorage.getItem('barcodeScannerEngine');
      return stored || 'zxing';
    } catch {
      return 'zxing';
    }
  });
  const [engineInstance, setEngineInstance] =
    useState<BarcodeScannerEngine | null>(null);

  // Camera Selection
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  // Scanning State
  const [isScanning, setIsScanning] = useState(false);
  const [scanLine, setScanLine] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [scanAreaSize, setScanAreaSize] = useState(() => {
    try {
      const storedSize = localStorage.getItem('barcodeScanAreaSize');
      return storedSize ? JSON.parse(storedSize) : { width: 280, height: 140 };
    } catch {
      return { width: 280, height: 140 };
    }
  });

  // UI State
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualBarcodeValue, setManualBarcodeValue] = useState('');
  const [internalContinuousMode, setInternalContinuousMode] = useState(() => {
    try {
      const storedMode = localStorage.getItem('barcodeContinuousMode');
      return storedMode ? JSON.parse(storedMode) : true;
    } catch {
      return true;
    }
  });

  const lastScanTime = useRef(0);
  const scanCooldown = 2000;
  const lastDetectedBarcode = useRef<string>('');
  const currentTrack = useRef<MediaStreamTrack | null>(null);

  // Refresh Trigger
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // --- Camera Enumeration ---
  useEffect(() => {
    const getCameras = async () => {
      try {
        // Request permission first to get labels
        await navigator.mediaDevices.getUserMedia({ video: true });

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(
          (device) => device.kind === 'videoinput'
        );
        setCameras(videoDevices);

        if (videoDevices.length > 0) {
          // Try to respect cameraFacing prop if no specific camera selected yet
          if (!selectedCameraId) {
            const preferred = videoDevices.find((d) =>
              cameraFacing === 'front'
                ? d.label.toLowerCase().includes('front')
                : d.label.toLowerCase().includes('back')
            );
            setSelectedCameraId(
              preferred?.deviceId || videoDevices[0].deviceId
            );
          }
        }
      } catch (err) {
        console.error('Error enumerating devices:', err);
      }
    };

    if (isActive) {
      getCameras();
    }
  }, [isActive, cameraFacing]); // Re-check when active toggles

  const createEngine = (name: string): BarcodeScannerEngine => {
    switch (name) {
      case 'zxing':
        return new ZxingEngine();
      case 'html5-qrcode':
        return new Html5QrcodeEngine();
      case 'quagga2':
        return new QuaggaEngine();
      default:
        return new ZxingEngine();
    }
  };

  useEffect(() => {
    const engine = createEngine(selectedEngine);
    setEngineInstance(engine);
    try {
      localStorage.setItem('barcodeScannerEngine', selectedEngine);
    } catch {}
  }, [selectedEngine]);

  const turnOffTorch = useCallback(async () => {
    if (!currentTrack.current || !torchSupported || !torchEnabled) return;
    try {
      await currentTrack.current.applyConstraints({
        advanced: [{ torch: false } as any],
      });
      setTorchEnabled(false);
    } catch (error) {
      console.error('Error turning off torch:', error);
    }
  }, [torchEnabled, torchSupported]);

  const toggleTorch = useCallback(async () => {
    if (!currentTrack.current || !torchSupported) return;
    try {
      await currentTrack.current.applyConstraints({
        advanced: [{ torch: !torchEnabled } as any],
      });
      setTorchEnabled(!torchEnabled);
    } catch (error) {
      console.error('Error toggling torch:', error);
    }
  }, [torchEnabled, torchSupported]);

  // Main Scanning Loop
  useEffect(() => {
    if (
      !isActive ||
      !engineInstance ||
      !containerRef.current ||
      !selectedCameraId
    ) {
      engineInstance?.stop();
      setIsScanning(false);
      return;
    }

    const constraints = {
      video: {
        deviceId: { exact: selectedCameraId },
        width: { ideal: 1280 }, // Lowering ideal might help mobile performance/compatibility
        frameRate: { ideal: 30 },
        focusMode: { ideal: 'continuous' },
      } as any, // Cast to allow custom properties
    };

    const start = async () => {
      try {
        // Init engine with container
        engineInstance.init(containerRef.current!);

        engineInstance.onDetected((code: string) => {
          const now = Date.now();
          if (
            code !== lastDetectedBarcode.current ||
            !internalContinuousMode ||
            now - lastScanTime.current > scanCooldown
          ) {
            console.log('Barcode detected:', code);
            setScanLine(true);
            setTimeout(() => setScanLine(false), 500);
            onBarcodeDetected(code);
            lastScanTime.current = now;
            lastDetectedBarcode.current = code;
            turnOffTorch();
            if (!internalContinuousMode) {
              setIsScanning(false);
              engineInstance.stop();
            }
          }
        });

        // Pass selectedCameraId explicitly if engine supports it better that way,
        // OR rely on constraints. Our interface update sends both.
        await engineInstance.start(constraints, selectedCameraId);
        setIsScanning(true);

        if (engineInstance.getMediaTrack) {
          const track = engineInstance.getMediaTrack();
          if (track) {
            currentTrack.current = track;
            const caps = track.getCapabilities();
            setTorchSupported('torch' in caps);
          } else {
            setTorchSupported(false);
          }
        }
      } catch (e) {
        console.error('Error starting scanner engine:', e);
        setIsScanning(false);
      }
    };

    // Small timeout to allow previous stop to cleanup
    const timer = setTimeout(() => {
      start();
    }, 100);

    return () => {
      clearTimeout(timer);
      engineInstance.stop();
      setIsScanning(false);
    };
  }, [
    isActive,
    engineInstance,
    selectedCameraId,
    internalContinuousMode,
    onBarcodeDetected,
    turnOffTorch,
    refreshTrigger,
  ]); // Dependencies - restarts if any change

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem('barcodeScanAreaSize', JSON.stringify(scanAreaSize));
    } catch {}
  }, [scanAreaSize]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'barcodeContinuousMode',
        JSON.stringify(internalContinuousMode)
      );
    } catch {}
  }, [internalContinuousMode]);

  const handleManualBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcodeValue.trim()) {
      onBarcodeDetected(manualBarcodeValue.trim());
      setManualBarcodeValue('');
      setShowManualInput(false);
      onClose();
    }
  };

  const handleCornerDrag = useCallback(
    (corner: string, deltaX: number, deltaY: number) => {
      setScanAreaSize((prev) => {
        let newWidth = prev.width;
        let newHeight = prev.height;
        if (corner.includes('right'))
          newWidth = Math.max(200, Math.min(400, prev.width + deltaX));
        if (corner.includes('left'))
          newWidth = Math.max(200, Math.min(400, prev.width - deltaX));
        if (corner.includes('bottom'))
          newHeight = Math.max(100, Math.min(200, prev.height + deltaY));
        if (corner.includes('top'))
          newHeight = Math.max(100, Math.min(200, prev.height - deltaY));
        return { width: newWidth, height: newHeight };
      });
    },
    []
  );

  return (
    <div className="relative bg-black rounded-lg overflow-hidden shadow-lg w-full max-w-lg mx-auto flex flex-col">
      {/* Height controlled here via inline style or class. Returning to h-80 (320px) or similar */}
      <div className="relative w-full h-[400px] bg-black">
        {/* Header Controls (Engine & Camera) */}
        <div className="absolute top-4 left-4 right-16 z-20 flex flex-col gap-2 pointer-events-auto">
          <Select value={selectedEngine} onValueChange={setSelectedEngine}>
            <SelectTrigger className="w-full max-w-[150px] bg-black/60 text-white border-gray-600 h-8 text-xs">
              <SelectValue placeholder="Engine" />
            </SelectTrigger>
            <SelectContent>
              {ENGINE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {cameras.length > 0 && (
            <Select
              value={selectedCameraId}
              onValueChange={setSelectedCameraId}
            >
              <SelectTrigger className="w-full max-w-[150px] bg-black/60 text-white border-gray-600 h-8 text-xs">
                <Camera className="w-3 h-3 mr-2" />
                <SelectValue placeholder="Camera" />
              </SelectTrigger>
              <SelectContent>
                {cameras.map((cam) => (
                  <SelectItem key={cam.deviceId} value={cam.deviceId}>
                    {cam.label || `Camera ${cam.deviceId.slice(0, 4)}...`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {!showManualInput ? (
          <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
            {/* Scanner Container */}
            <div
              ref={containerRef}
              id="scanner-viewport"
              className="w-full h-full absolute inset-0"
              // Important: styles to ensure video fills container without distorting if possible
            />

            <canvas ref={canvasRef} className="hidden" />

            {/* Overlay UI */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div
                className="relative pointer-events-auto"
                style={{
                  width: scanAreaSize.width,
                  height: scanAreaSize.height,
                }}
              >
                <div
                  className="relative w-full border-2 border-white border-dashed rounded-lg overflow-hidden box-border"
                  style={{ height: scanAreaSize.height }}
                >
                  {scanLine && (
                    <div
                      className="absolute left-0 w-full h-1 bg-green-400 animate-scan-line"
                      style={{ top: 'auto' }}
                    />
                  )}
                </div>
                <ResizableCorner
                  position="top-left"
                  onDrag={(dx, dy) => handleCornerDrag('top-left', dx, dy)}
                />
                <ResizableCorner
                  position="top-right"
                  onDrag={(dx, dy) => handleCornerDrag('top-right', dx, dy)}
                />
                <ResizableCorner
                  position="bottom-left"
                  onDrag={(dx, dy) => handleCornerDrag('bottom-left', dx, dy)}
                />
                <ResizableCorner
                  position="bottom-right"
                  onDrag={(dx, dy) => handleCornerDrag('bottom-right', dx, dy)}
                />
              </div>
            </div>

            <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none z-10">
              <p className="text-white text-xs bg-black/60 rounded px-3 py-1 inline-flex items-center backdrop-blur-sm">
                <Scan className="w-3 h-3 mr-1" />
                {internalContinuousMode ? 'Continuous Scan' : 'Align Barcode'}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4 flex flex-col items-center justify-center h-full">
            <h3 className="text-white text-lg mb-4">
              {t('barcodeScanner.manualInput.title', 'Enter Barcode Manually')}
            </h3>
            <form
              onSubmit={handleManualBarcodeSubmit}
              className="w-full max-w-xs space-y-4"
            >
              <Input
                type="text"
                placeholder={t(
                  'barcodeScanner.manualInput.placeholder',
                  'Enter barcode'
                )}
                value={manualBarcodeValue}
                onChange={(e) => setManualBarcodeValue(e.target.value)}
                className="w-full bg-gray-700 text-white border-gray-600"
              />
              <Button
                type="submit"
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {t('barcodeScanner.manualInput.submitButton', 'Submit Barcode')}
              </Button>
            </form>
          </div>
        )}

        {/* Right Side Controls */}
        <div className="absolute top-4 right-4 flex flex-col space-y-3 z-30 pointer-events-none">
          <div className="flex flex-col space-y-3 pointer-events-auto items-end">
            <button
              onClick={() => {
                setShowManualInput((prev) => !prev);
                engineInstance?.stop();
              }}
              className="bg-black/60 hover:bg-black/80 text-white pl-4 pr-2 py-2 rounded-full transition-colors backdrop-blur-sm flex items-center space-x-2 border border-white/10"
            >
              <span className="text-xs font-medium">
                {showManualInput
                  ? t('barcodeScanner.buttons.camera', 'Camera')
                  : t('barcodeScanner.buttons.manual', 'Enter Scan Code')}
              </span>
              <Keyboard className="w-4 h-4" />
            </button>

            {!showManualInput && (
              <button
                onClick={() => setInternalContinuousMode((prev) => !prev)}
                className={`pl-4 pr-2 py-2 rounded-full transition-colors backdrop-blur-sm flex items-center space-x-2 border border-white/10 ${internalContinuousMode ? 'bg-green-500/80 hover:bg-green-600/90 text-white' : 'bg-black/60 hover:bg-black/80 text-white'}`}
              >
                <span className="text-xs font-medium">
                  {internalContinuousMode
                    ? t('barcodeScanner.buttons.continuous', 'Continuous')
                    : t('barcodeScanner.buttons.single', 'Single Scan')}
                </span>
                <Scan className="w-4 h-4" />
              </button>
            )}

            {!showManualInput && (
              <button
                onClick={() => setRefreshTrigger((prev) => prev + 1)}
                className="bg-black/60 hover:bg-black/80 text-white pl-4 pr-2 py-2 rounded-full transition-colors backdrop-blur-sm flex items-center space-x-2 border border-white/10"
              >
                <span className="text-xs font-medium">
                  {t('barcodeScanner.buttons.refresh', 'Refresh Focus')}
                </span>
                <RefreshCcw className="w-4 h-4" />
              </button>
            )}

            {!showManualInput && torchSupported && (
              <button
                onClick={toggleTorch}
                className={`pl-4 pr-2 py-2 rounded-full transition-colors backdrop-blur-sm flex items-center space-x-2 border border-white/10 ${torchEnabled ? 'bg-yellow-500/80 hover:bg-yellow-600/90 text-white' : 'bg-black/60 hover:bg-black/80 text-white'}`}
              >
                <span className="text-xs font-medium">
                  {torchEnabled
                    ? t('barcodeScanner.buttons.flashOn', 'Flash On')
                    : t('barcodeScanner.buttons.flashOff', 'Flash Off')}
                </span>
                {torchEnabled ? (
                  <Flashlight className="w-4 h-4" />
                ) : (
                  <FlashlightOff className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Resizable Corner (Same as before)
interface ResizableCornerProps {
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  onDrag: (deltaX: number, deltaY: number) => void;
}

const ResizableCorner: React.FC<ResizableCornerProps> = ({
  position,
  onDrag,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    const touch = e.touches[0];
    lastPos.current = { x: touch.clientX, y: touch.clientY };
    e.preventDefault();
  };

  useEffect(() => {
    const handleMove = (clientX: number, clientY: number) => {
      if (!isDragging) return;
      const deltaX = clientX - lastPos.current.x;
      const deltaY = clientY - lastPos.current.y;
      onDrag(deltaX, deltaY);
      lastPos.current = { x: clientX, y: clientY };
    };

    const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    };

    const handleEnd = () => setIsDragging(false);

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, onDrag]);

  const getPositionClasses = () => {
    const base = 'absolute w-6 h-6 cursor-pointer touch-none z-20'; // Increased z-index
    const corner = 'border-4 border-green-400';
    switch (position) {
      case 'top-left':
        return `${base} -top-3 -left-3 ${corner} border-r-0 border-b-0`;
      case 'top-right':
        return `${base} -top-3 -right-3 ${corner} border-l-0 border-b-0`;
      case 'bottom-left':
        return `${base} -bottom-3 -left-3 ${corner} border-r-0 border-t-0`;
      case 'bottom-right':
        return `${base} -bottom-3 -right-3 ${corner} border-l-0 border-t-0`;
      default:
        return base;
    }
  };

  return (
    <div
      className={getPositionClasses()}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    />
  );
};

export default BarcodeScanner;
