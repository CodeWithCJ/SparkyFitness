
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserMultiFormatReader, NotFoundException, Result } from '@zxing/library';
import { Scan, Camera, Flashlight, FlashlightOff, Keyboard } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface BarcodeScannerProps {
  onBarcodeDetected: (barcode: string) => void;
  onClose: () => void;
  isActive: boolean;
  cameraFacing: 'front' | 'back';
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onBarcodeDetected,
  onClose,
  isActive,
  cameraFacing,
}) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [codeReader] = useState(() => new BrowserMultiFormatReader());
  const [isScanning, setIsScanning] = useState(false);
  const [scanLine, setScanLine] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [scanAreaSize, setScanAreaSize] = useState(() => {
    try {
      const storedSize = localStorage.getItem('barcodeScanAreaSize');
      return storedSize ? JSON.parse(storedSize) : { width: 280, height: 140 };
    } catch (error) {
      console.error("Failed to parse stored scan area size, using default.", error);
      return { width: 280, height: 140 };
    }
  });
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualBarcodeValue, setManualBarcodeValue] = useState('');
  const [internalContinuousMode, setInternalContinuousMode] = useState(() => {
    try {
      const storedMode = localStorage.getItem('barcodeContinuousMode');
      return storedMode ? JSON.parse(storedMode) : true; // Default to true if not found
    } catch (error) {
      console.error("Failed to parse stored continuous mode, using default.", error);
      return true;
    }
  });
  const lastScanTime = useRef(0);
  const scanCooldown = 2000;
  const animationFrameRef = useRef<number>();
  const lastDetectedBarcode = useRef<string>('');
  const currentTrack = useRef<MediaStreamTrack | null>(null);
  const instructionTimeoutRef = useRef<NodeJS.Timeout>();

  const resetLastBarcode = useCallback(() => {
    lastDetectedBarcode.current = '';
  }, []);

  const turnOffTorch = useCallback(async () => {
    if (!currentTrack.current || !torchSupported || !torchEnabled) return;

    try {
      await currentTrack.current.applyConstraints({
        advanced: [{ torch: false } as any]
      });
      setTorchEnabled(false);
    } catch (error) {
      console.error('Error turning off torch:', error);
    }
  }, [torchEnabled, torchSupported]);

  const scanFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isScanning) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animationFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      // Convert canvas to data URL and decode
      const dataUrl = canvas.toDataURL('image/png');
      codeReader.decodeFromImage(undefined, dataUrl)
        .then((result: Result) => {
          if (result) {
            const barcode = result.getText();
            const now = Date.now();
            
            // Check if this is a new barcode or enough time has passed
            if (barcode !== lastDetectedBarcode.current ||
                (!internalContinuousMode || now - lastScanTime.current > scanCooldown)) {
              
              console.log('Barcode detected:', barcode);
              setScanLine(true);
              
              // Turn off torch after successful scan
              turnOffTorch();
              
              setTimeout(() => setScanLine(false), 500);
              
              onBarcodeDetected(barcode);
              lastScanTime.current = now;
              lastDetectedBarcode.current = barcode;
              
              if (!internalContinuousMode) {
                setIsScanning(false);
                return;
              }
            }
          }
        })
        .catch((error) => {
          // Only log non-NotFoundException errors
          if (!(error instanceof NotFoundException)) {
            console.error('Scanning error:', error);
          }
        });
    } catch (error) {
      console.error('Canvas decode error:', error);
    }

    if (internalContinuousMode && isScanning) {
      animationFrameRef.current = requestAnimationFrame(scanFrame);
    }
  }, [isScanning, internalContinuousMode, onBarcodeDetected, codeReader, scanCooldown, turnOffTorch]);

  const toggleTorch = useCallback(async () => {
    if (!currentTrack.current || !torchSupported) return;

    try {
      await currentTrack.current.applyConstraints({
        advanced: [{ torch: !torchEnabled } as any]
      });
      setTorchEnabled(!torchEnabled);
    } catch (error) {
      console.error('Error toggling torch:', error);
    }
  }, [torchEnabled, torchSupported]);

  const handleVideoTap = useCallback(async () => {
    if (!currentTrack.current) return;

    try {
      // Try to refocus
      await currentTrack.current.applyConstraints({
        focusMode: 'single-shot'
      } as any);
    } catch (error) {
      console.error('Error applying focus:', error);
    }
  }, []);

  const handleCornerDrag = useCallback((corner: string, deltaX: number, deltaY: number) => {
    setScanAreaSize(prev => {
      let newWidth = prev.width;
      let newHeight = prev.height;
      
      if (corner.includes('right')) {
        newWidth = Math.max(200, Math.min(400, prev.width + deltaX));
      }
      if (corner.includes('left')) {
        newWidth = Math.max(200, Math.min(400, prev.width - deltaX));
      }
      if (corner.includes('bottom')) {
        newHeight = Math.max(100, Math.min(200, prev.height + deltaY));
      }
      if (corner.includes('top')) {
        newHeight = Math.max(100, Math.min(200, prev.height - deltaY));
      }
      
      return { width: newWidth, height: newHeight };
    });
  }, []);

  useEffect(() => {
    if (isActive && videoRef.current) {
      startScanning();
    } else {
      stopScanning();
    }

    return () => {
      stopScanning();
    };
  }, [isActive, cameraFacing]);

  // Save scanAreaSize to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('barcodeScanAreaSize', JSON.stringify(scanAreaSize));
    } catch (error) {
      console.error("Failed to save scan area size to localStorage.", error);
    }
  }, [scanAreaSize]);

  useEffect(() => {
    if (isScanning && internalContinuousMode) {
      resetLastBarcode();
      animationFrameRef.current = requestAnimationFrame(scanFrame);
      
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (instructionTimeoutRef.current) {
        clearTimeout(instructionTimeoutRef.current);
      }
    };
  }, [isScanning, internalContinuousMode, scanFrame, resetLastBarcode]);

  // Save internalContinuousMode to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('barcodeContinuousMode', JSON.stringify(internalContinuousMode));
    } catch (error) {
      console.error("Failed to save continuous mode to localStorage.", error);
    }
  }, [internalContinuousMode]);

  const startScanning = async () => {
    if (!videoRef.current || isScanning) return;

    try {
      setIsScanning(true);
      resetLastBarcode();
      
      const constraints = {
        video: {
          facingMode: cameraFacing === 'front' ? 'user' : { ideal: 'environment' },
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
          focusMode: { ideal: 'continuous' },
          zoom: true
        } as any
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoRef.current.srcObject = stream;
      
      // Get the video track to control torch and focus
      const videoTrack = stream.getVideoTracks()[0];
      currentTrack.current = videoTrack;
      
      // Check torch support
      const capabilities = videoTrack.getCapabilities();
      setTorchSupported('torch' in capabilities);
      
      videoRef.current.onloadedmetadata = () => {
        if (videoRef.current) {
          videoRef.current.play();
          if (internalContinuousMode) {
            animationFrameRef.current = requestAnimationFrame(scanFrame);
          }
        }
      };

    } catch (error) {
      console.error('Error accessing camera:', error);
      setIsScanning(false);
    }
  };

  const handleManualBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcodeValue.trim()) {
      onBarcodeDetected(manualBarcodeValue.trim());
      setManualBarcodeValue('');
      setShowManualInput(false); // Hide manual input after submission
      onClose(); // Close the scanner after manual entry
    }
  };

  const stopScanning = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    if (instructionTimeoutRef.current) {
      clearTimeout(instructionTimeoutRef.current);
    }
    
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    
    currentTrack.current = null;
    setIsScanning(false);
    setTorchEnabled(false);
    resetLastBarcode();
  };

  const forceScan = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    setScanLine(true);
    setTimeout(() => setScanLine(false), 500);

    // Set canvas size and draw current frame
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const dataUrl = canvas.toDataURL('image/png');
      codeReader.decodeFromImage(undefined, dataUrl)
        .then((result: Result) => {
          if (result) {
            console.log('Force scan result:', result.getText());
            onBarcodeDetected(result.getText());
            lastDetectedBarcode.current = result.getText();
            lastScanTime.current = Date.now();
            
            // Turn off torch after successful scan
            turnOffTorch();
          }
        })
        .catch((error) => {
          if (!(error instanceof NotFoundException)) {
            console.error('Force scan error:', error);
          }
        });
    } catch (error) {
      console.error('Force scan canvas error:', error);
    }
  };

  return (
    <div className="relative bg-black rounded-lg overflow-hidden shadow-lg">
      {!showManualInput ? (
        <>
          <video
            ref={videoRef}
            className="w-full h-64 object-cover cursor-pointer"
            playsInline
            muted
            onClick={handleVideoTap}
          />
          
          {/* Hidden canvas for processing */}
          <canvas
            ref={canvasRef}
            className="hidden"
          />
          
          {/* Scanner Overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative" style={{ width: scanAreaSize.width, height: scanAreaSize.height }}>
              {/* Scanner Frame */}
              <div className="relative w-full border-2 border-white border-dashed rounded-lg overflow-hidden" style={{ height: scanAreaSize.height }}>
                {/* Animated Scan Line */}
                {scanLine && (
                  <div className="absolute left-0 w-full h-1 bg-green-400 animate-scan-line" style={{ top: 'auto' }}></div>
                )}
              </div>
              
              {/* Resizable Corner Indicators */}
              <ResizableCorner
                position="top-left"
                onDrag={(deltaX, deltaY) => handleCornerDrag('top-left', deltaX, deltaY)}
              />
              <ResizableCorner
                position="top-right"
                onDrag={(deltaX, deltaY) => handleCornerDrag('top-right', deltaX, deltaY)}
              />
              <ResizableCorner
                position="bottom-left"
                onDrag={(deltaX, deltaY) => handleCornerDrag('bottom-left', deltaX, deltaY)}
              />
              <ResizableCorner
                position="bottom-right"
                onDrag={(deltaX, deltaY) => handleCornerDrag('bottom-right', deltaX, deltaY)}
              />
            </div>
          </div>


          {/* Scan Status */}
          <div className="absolute bottom-4 left-0 right-0 text-center">
            <p className="text-white text-sm bg-black bg-opacity-50 rounded px-3 py-1 inline-block">
              <Scan className="inline w-4 h-4 mr-1" />
              {internalContinuousMode ? t('barcodeScanner.status.scanningContinuously', 'Scanning continuously...') : t('barcodeScanner.status.alignBarcode', 'Align barcode within the frame')}
            </p>
          </div>
        </>
      ) : (
        <div className="p-4 flex flex-col items-center justify-center h-64">
          <h3 className="text-white text-lg mb-4">{t('barcodeScanner.manualInput.title', 'Enter Barcode Manually')}</h3>
          <form onSubmit={handleManualBarcodeSubmit} className="w-full max-w-xs space-y-4">
            <Input
              type="text"
              placeholder={t('barcodeScanner.manualInput.placeholder', 'Enter barcode')}
              value={manualBarcodeValue}
              onChange={(e) => setManualBarcodeValue(e.target.value)}
              className="w-full bg-gray-700 text-white border-gray-600"
            />
            <Button type="submit" className="w-full bg-green-600 hover:bg-green-700">
              {t('barcodeScanner.manualInput.submitButton', 'Submit Barcode')}
            </Button>
          </form>
        </div>
      )}

      {/* Control Buttons */}
      <div className="absolute top-4 right-4 flex flex-col space-y-2">

        {/* Toggle Manual Input Button */}
        <button
          onClick={() => {
            setShowManualInput(prev => !prev);
            stopScanning(); // Stop camera scanning when switching to manual input
          }}
          className="bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-full transition-colors"
          title={showManualInput ? t('barcodeScanner.buttons.switchToCameraScan', 'Switch to Camera Scan') : t('barcodeScanner.buttons.enterBarcodeManually', 'Enter Barcode Manually')}
        >
          <Keyboard className="w-5 h-5" />
        </button>

        {/* Toggle Continuous Mode Button (only visible in camera mode) */}
        {!showManualInput && (
          <button
            onClick={() => setInternalContinuousMode(prev => !prev)}
            className={`p-2 rounded-full transition-colors ${
              internalContinuousMode
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-orange-500 hover:bg-orange-600 text-white'
            }`}
            title={internalContinuousMode ? t('barcodeScanner.buttons.switchToSingleScanMode', 'Switch to Single Scan Mode') : t('barcodeScanner.buttons.switchToContinuousScanMode', 'Switch to Continuous Scan Mode')}
          >
            <Scan className="w-5 h-5" />
          </button>
        )}

        {/* Force Scan Button (only visible in camera mode) */}
        {!showManualInput && (
          <button
            onClick={forceScan}
            className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full transition-colors"
            title={t('barcodeScanner.buttons.forceScan', 'Force Scan')}
          >
            <Camera className="w-5 h-5" />
          </button>
        )}

        {/* Torch Toggle (only visible in camera mode and if supported) */}
        {!showManualInput && torchSupported && (
          <button
            onClick={toggleTorch}
            className={`p-2 rounded-full transition-colors ${
              torchEnabled
                ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                : 'bg-gray-600 hover:bg-gray-700 text-white'
            }`}
            title={torchEnabled ? t('barcodeScanner.buttons.turnOffFlashlight', 'Turn off flashlight') : t('barcodeScanner.buttons.turnOnFlashlight', 'Turn on flashlight')}
          >
            {torchEnabled ? <Flashlight className="w-5 h-5" /> : <FlashlightOff className="w-5 h-5" />}
          </button>
        )}
      </div>
    </div>
  );
};

// Resizable Corner Component
interface ResizableCornerProps {
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  onDrag: (deltaX: number, deltaY: number) => void;
}

const ResizableCorner: React.FC<ResizableCornerProps> = ({ position, onDrag }) => {
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
    const base = "absolute w-6 h-6 cursor-pointer touch-none";
    const corner = "border-4 border-green-400";
    
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