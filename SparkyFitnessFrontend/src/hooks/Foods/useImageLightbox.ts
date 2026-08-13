import { useCallback, useState } from 'react';

interface LightboxState {
  images: string[];
  index: number;
  title?: string;
}

/**
 * Drives a single shared ImageLightbox for a list of thumbnails.
 *
 * One viewer instance per list rather than one per row: the images to show are
 * passed in at click time, so mounting N rows doesn't mount N dialogs.
 */
export function useImageLightbox() {
  const [state, setState] = useState<LightboxState | null>(null);

  const openLightbox = useCallback(
    (images: string[], index = 0, title?: string) => {
      if (images.length === 0) {
        return;
      }
      setState({ images, index, title });
    },
    []
  );

  const setOpen = useCallback((open: boolean) => {
    if (!open) {
      setState(null);
    }
  }, []);

  return {
    /** Props to spread onto <ImageLightbox />. */
    lightboxProps: {
      images: state?.images ?? [],
      initialIndex: state?.index ?? 0,
      title: state?.title,
      open: state !== null,
      onOpenChange: setOpen,
    },
    openLightbox,
  };
}

export default useImageLightbox;
