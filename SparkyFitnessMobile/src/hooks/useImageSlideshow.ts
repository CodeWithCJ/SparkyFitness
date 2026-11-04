import { useEffect, useState } from 'react';

/**
 * Index of the image to show when cycling through `count` images every
 * `intervalMs` — the start/end position photos most library exercises carry
 * read as a movement demo when flipped. One image (or a GIF) stays put, and
 * `paused` holds the current frame.
 */
export function useImageSlideshow(
  count: number,
  intervalMs = 1000,
  paused = false
): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (count < 2 || paused) return;
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [count, intervalMs, paused]);
  return count > 0 ? tick % count : 0;
}
