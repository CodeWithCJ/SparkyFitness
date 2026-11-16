/**
 * Whether the active-workout header moves up into the status-bar row. That is
 * the iPhone Duo's unfolded portrait pose, where the status cluster sits beside
 * the header and the top inset would only waste a row. iOS only: Android has a
 * top inset too, and on a foldable or tablet that is 600 dp wide the header
 * would land under the system status bar.
 */
export function shouldPlaceHeaderInStatusRow({
  os,
  railBeside,
  topInset,
  windowWidth,
}: {
  os: string;
  railBeside: boolean;
  topInset: number;
  windowWidth: number;
}): boolean {
  return os === 'ios' && !railBeside && topInset > 0 && windowWidth >= 600;
}

/** A rect the system reserves for its status content, in window points. */
export interface StatusRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Widest a vertical status strip gets; wider reserved rects are a status row. */
const MAX_STRIP_WIDTH = 140;
/** Reserved rects that start below this are not part of the status band. */
const STATUS_BAND_HEIGHT = 240;

/**
 * Where the status content in a side strip ends, in window points: the bottom
 * of the lowest narrow reserved region. This is the clock, the Wi-Fi cluster
 * and any Live Activity stacked into them, so it moves down by itself when an
 * activity starts. `null` when nothing was measured.
 *
 * Only regions in the status band at the top count. In the middle of a
 * rotation UIKit already reports the new pose's regions in the old window's
 * coordinates, and a strip there lands at the bottom of the screen; that is not
 * a strip, and answering from it would wrongly say the column is crowded.
 */
export function verticalStripBottom(
  regions: StatusRegion[] | null
): number | null {
  if (regions == null) return null;
  const strip = regions.filter(
    (r) =>
      r.width > 0 &&
      r.width <= MAX_STRIP_WIDTH &&
      r.height > 0 &&
      r.y < STATUS_BAND_HEIGHT
  );
  if (strip.length === 0) return null;
  return Math.max(...strip.map((r) => r.y + r.height));
}

/**
 * The status cluster of the tall pose, where it is a row across the top right:
 * its left edge and its bottom, in window points. A Live Activity widens it
 * leftwards. `null` when nothing was measured.
 */
export function statusRowCluster(
  regions: StatusRegion[] | null,
  windowWidth: number
): { left: number; bottom: number } | null {
  if (regions == null) return null;
  const row = regions.filter(
    (r) =>
      r.width > 0 &&
      r.height > 0 &&
      r.y < STATUS_BAND_HEIGHT &&
      r.x + r.width > windowWidth / 2
  );
  if (row.length === 0) return null;
  return {
    left: Math.min(...row.map((r) => r.x)),
    bottom: Math.max(...row.map((r) => r.y + r.height)),
  };
}

/**
 * The reserved region of the bare clock + Wi-Fi cluster in the tall pose is 144
 * pt wide (measured, margins included). A region clearly wider than that means
 * a Live Activity has joined the cluster.
 */
const BARE_CLUSTER_REGION_WIDTH = 144;

/** Whether the tall pose's status cluster is wider than the bare clock + Wi-Fi. */
export function clusterHasActivity(
  cluster: { left: number } | null,
  windowWidth: number
): boolean | null {
  if (cluster == null) return null;
  return windowWidth - cluster.left > BARE_CLUSTER_REGION_WIDTH + 8;
}
