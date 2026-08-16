import React, { createContext, useContext, useMemo } from 'react';
import {
  useFoodImageSource,
  type GetFoodImageSource,
} from '../hooks/useFoodImageSource';

const FoodImageSourceContext = createContext<GetFoodImageSource | null>(null);

// Rows reach the resolver through context rather than props: food rows are
// rendered via a union dispatcher (FoodSearchResultRow) several layers below
// the screen, and threading a prop through every branch would touch far more
// code than it earns. Mounted once in App.tsx — the resolver only needs the
// active server's origin and proxy headers, so one instance (and one path
// cache) serves every screen.
export const FoodImageSourceProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { getImageSource } = useFoodImageSource();

  const value = useMemo(() => getImageSource, [getImageSource]);

  return (
    <FoodImageSourceContext.Provider value={value}>
      {children}
    </FoodImageSourceContext.Provider>
  );
};

// A row outside a provider degrades to "no image" (the thumbnail renders its
// fallback) rather than crashing — a missing provider should never take a
// screen down over a decoration.
const NO_IMAGE_SOURCE: GetFoodImageSource = () => null;

export function useFoodImageSourceContext(): GetFoodImageSource {
  return useContext(FoodImageSourceContext) ?? NO_IMAGE_SOURCE;
}
