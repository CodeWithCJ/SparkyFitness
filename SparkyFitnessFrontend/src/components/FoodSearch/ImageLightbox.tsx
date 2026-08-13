import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface ImageLightboxProps {
  images: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Index to open on — usually the thumbnail the user clicked. */
  initialIndex?: number;
  /** Accessible name for the dialog, e.g. the food's name. */
  title?: string;
  /** Milliseconds each slide is shown while playing. */
  intervalMs?: number;
}

const DEFAULT_INTERVAL_MS = 3000;

/**
 * Full-size image viewer with slideshow controls.
 *
 * Auto-advance starts as soon as it opens when there is more than one image,
 * and pauses automatically when the tab is hidden so it doesn't churn in the
 * background. Manual navigation pauses it, on the assumption that someone who
 * clicked an arrow wants to stay on that image.
 */
/**
 * Slide state lives here rather than in the wrapper so it initializes on mount.
 * The wrapper gives this a `key` tied to the opened image, so re-opening on a
 * different thumbnail mounts a fresh instance starting at that slide — no
 * re-seeding effect required.
 */
function LightboxContent({
  images,
  initialIndex,
  title,
  intervalMs,
}: Required<Omit<ImageLightboxProps, 'open' | 'onOpenChange'>>) {
  const { t } = useTranslation();
  const count = images.length;
  const hasMultiple = count > 1;
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(initialIndex, 0), Math.max(count - 1, 0))
  );
  // Auto-play from the moment it opens, when there is something to cycle.
  const [playing, setPlaying] = useState(hasMultiple);

  const goTo = useCallback(
    (next: number) => {
      if (count === 0) {
        return;
      }
      setIndex(((next % count) + count) % count);
    },
    [count]
  );

  const showNext = useCallback(() => goTo(index + 1), [goTo, index]);
  const showPrev = useCallback(() => goTo(index - 1), [goTo, index]);

  // Manual navigation stops the slideshow rather than fighting the user.
  const handleNext = useCallback(() => {
    setPlaying(false);
    showNext();
  }, [showNext]);
  const handlePrev = useCallback(() => {
    setPlaying(false);
    showPrev();
  }, [showPrev]);

  // Auto-advance timer.
  useEffect(() => {
    if (!playing || !hasMultiple) {
      return;
    }
    const timer = window.setInterval(showNext, intervalMs);
    return () => window.clearInterval(timer);
  }, [playing, hasMultiple, showNext, intervalMs]);

  // Don't cycle images the user cannot see.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        setPlaying(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // Arrow-key navigation. Esc is already handled by the dialog primitive.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        handleNext();
      } else if (event.key === 'ArrowLeft') {
        handlePrev();
      } else if (event.key === ' ') {
        event.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleNext, handlePrev]);

  return (
    <>
      {/* DialogContent renders its own close button in the top-right. */}
      <DialogContent className="max-w-4xl p-0 bg-black/95 border-none">
        {/* Named for screen readers; the visual title would clutter the image. */}
        <DialogTitle className="sr-only">
          {title || t('food.imageViewer', 'Image viewer')}
        </DialogTitle>

        <div className="relative flex items-center justify-center min-h-[50vh] max-h-[85vh]">
          <img
            src={images[index]}
            alt={t('food.imagePreviewAlt', {
              defaultValue: 'Food image {{number}}',
              number: index + 1,
            })}
            className="max-h-[85vh] max-w-full object-contain"
          />

          {hasMultiple && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
                onClick={handlePrev}
                aria-label={t('food.previousImage', 'Previous image')}
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
                onClick={handleNext}
                aria-label={t('food.nextImage', 'Next image')}
              >
                <ChevronRight className="h-6 w-6" />
              </Button>

              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-full bg-black/60 px-3 py-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-white hover:bg-white/20"
                  onClick={() => setPlaying((p) => !p)}
                  aria-label={
                    playing
                      ? t('food.pauseSlideshow', 'Pause slideshow')
                      : t('food.playSlideshow', 'Play slideshow')
                  }
                >
                  {playing ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
                <span className="text-xs text-white tabular-nums">
                  {index + 1} / {count}
                </span>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </>
  );
}

export function ImageLightbox({
  images,
  open,
  onOpenChange,
  initialIndex = 0,
  title,
  intervalMs = DEFAULT_INTERVAL_MS,
}: ImageLightboxProps) {
  if (images.length === 0) {
    return null;
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <LightboxContent
          key={`${initialIndex}-${images[0]}`}
          images={images}
          initialIndex={initialIndex}
          title={title ?? ''}
          intervalMs={intervalMs}
        />
      )}
    </Dialog>
  );
}

export default ImageLightbox;
