import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ImageSourceInputProps {
  /** Called with the picked, dropped, or pasted image. */
  onImage: (image: File) => void;
  /** Text on the upload button. */
  buttonLabel: string;
  /** Shows a spinner and ignores new images while the last one is processed. */
  busy?: boolean;
  /**
   * Whether a pasted image goes to this input. The listener is on the whole
   * document, so a screen with more than one input enables only one at a time.
   */
  pasteEnabled?: boolean;
  /** Shown under the input, for example when nothing was found in the image. */
  error?: string | null;
}

function firstImageFile(files: Iterable<File>): File | null {
  for (const file of files) {
    if (file.type.startsWith('image/')) return file;
  }
  return null;
}

/**
 * Takes one image from a file picker, a drag and drop, or the clipboard
 * (Ctrl+V / Cmd+V anywhere on the page, which is how a copied screenshot
 * arrives). Pasting text is left alone, so text inputs on the same screen
 * still work.
 */
export function ImageSourceInput({
  onImage,
  buttonLabel,
  busy = false,
  pasteEnabled = true,
  error,
}: ImageSourceInputProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const takeImage = useCallback(
    (image: File | null) => {
      if (image && !busy) onImage(image);
    },
    [busy, onImage]
  );

  useEffect(() => {
    if (!pasteEnabled) return;
    const handlePaste = (event: ClipboardEvent) => {
      const image = firstImageFile(event.clipboardData?.files ?? []);
      if (!image) return;
      event.preventDefault();
      takeImage(image);
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [pasteEnabled, takeImage]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    takeImage(firstImageFile(event.target.files ?? []));
    // Reset so picking the same file twice in a row still fires onChange.
    event.target.value = '';
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragActive(true);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    takeImage(firstImageFile(event.dataTransfer.files));
  };

  return (
    <div className="space-y-1">
      <div
        data-testid="image-source-drop-zone"
        onDragOver={handleDragOver}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col sm:flex-row items-center justify-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground transition-colors',
          dragActive && 'border-primary bg-primary/5'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          data-testid="image-source-file-input"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {busy ? <Loader2 className="animate-spin" /> : <ImageUp />}
          {buttonLabel}
        </Button>
        <span>
          {t(
            'foodSearch.imageSourceInput.dropOrPaste',
            'or drop an image here, or paste a screenshot'
          )}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
