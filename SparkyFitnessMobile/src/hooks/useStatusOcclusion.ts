import { useEffect, useState } from 'react';
import {
  watchOcclusion,
  type OcclusionRegion,
} from '../../modules/side-bar-metrics';

/**
 * The rects UIKit reserves for status content (clock, Wi-Fi cluster and any
 * Live Activity stacked into it), in window points. iOS reports no event when
 * a Live Activity starts or ends, so the native side watches every frame and
 * reports only changes; this hook just listens while `enabled`.
 *
 * Returns `null` until there is a reading and wherever there is none: before
 * iOS 27.1, in a build without the native module, and in tests. Callers treat
 * `null` as "no measurement" and keep their fixed layout.
 */
export function useStatusOcclusion(enabled: boolean): OcclusionRegion[] | null {
  const [regions, setRegions] = useState<OcclusionRegion[] | null>(null);

  useEffect(() => {
    if (!enabled) return;
    return watchOcclusion(({ regions: next }) => {
      setRegions((prev) =>
        JSON.stringify(prev) === JSON.stringify(next) ? prev : next
      );
    });
  }, [enabled]);

  // A stale reading from an earlier enabled spell must not leak through.
  return enabled ? regions : null;
}
