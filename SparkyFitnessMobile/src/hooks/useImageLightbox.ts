import { useCallback, useState } from 'react';
import type { ImageLightboxProps } from '../components/ImageLightbox';

/** Per-open extras: an exercise viewer brings its own image resolver and controls. */
export type LightboxOpenOptions = Pick<
  ImageLightboxProps,
  'getImageSource' | 'controls'
>;

type LightboxState = {
  visible: boolean;
  images: string[];
  initialIndex: number;
  title?: string;
} & LightboxOpenOptions;

const CLOSED: LightboxState = { visible: false, images: [], initialIndex: 0 };

/**
 * One lightbox per list rather than one per row.
 *
 * Spread `lightboxProps` onto a single `<ImageLightbox />` at the screen level
 * and call `openLightbox(images, index, title)` from each row. Mounting a modal
 * per row would multiply an off-screen Modal by the length of the list.
 */
export function useImageLightbox(): {
  lightboxProps: ImageLightboxProps;
  openLightbox: (
    images: string[],
    index?: number,
    title?: string,
    options?: LightboxOpenOptions
  ) => void;
} {
  const [state, setState] = useState<LightboxState>(CLOSED);

  const openLightbox = useCallback(
    (
      images: string[],
      index = 0,
      title?: string,
      options?: LightboxOpenOptions
    ) => {
      if (images.length === 0) return;
      setState({
        visible: true,
        images,
        initialIndex: Math.min(Math.max(index, 0), images.length - 1),
        title,
        ...options,
      });
    },
    []
  );

  const onClose = useCallback(() => {
    setState((current) => ({ ...current, visible: false }));
  }, []);

  return {
    lightboxProps: { ...state, onClose },
    openLightbox,
  };
}
