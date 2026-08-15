import React, { createContext, useContext } from 'react';
import ImageLightbox from './ImageLightbox';
import { useImageLightbox } from '../hooks/useImageLightbox';

type OpenLightbox = (images: string[], index?: number, title?: string) => void;

const LightboxContext = createContext<OpenLightbox | null>(null);

/**
 * One image viewer for the whole app.
 *
 * Mounted once in `App.tsx` rather than per screen: food thumbnails appear in
 * search, both libraries, the diary, meal-type day views and detail screens,
 * and wiring an `onImagePress` prop down to each of those (through a union
 * dispatcher, in the search case) meant a surface was silently left
 * non-interactive every time a new one appeared. A row now opens the viewer
 * directly, so adding a thumbnail anywhere is enough to make it tappable.
 */
export const LightboxProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { lightboxProps, openLightbox } = useImageLightbox();

  return (
    <LightboxContext.Provider value={openLightbox}>
      {children}
      <ImageLightbox {...lightboxProps} />
    </LightboxContext.Provider>
  );
};

// A row rendered outside the provider simply has a non-interactive thumbnail
// rather than crashing — a viewer is a nicety, not a reason to take a screen
// down.
const NOOP: OpenLightbox = () => {};

export function useOpenLightbox(): OpenLightbox {
  return useContext(LightboxContext) ?? NOOP;
}
